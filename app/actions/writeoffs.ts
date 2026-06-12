"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Writeoff } from "@/lib/supabase/types"
import { getOrgId } from "@/lib/services/organizationService"

export type WriteoffWithFlower = Writeoff & { flowers: { name: string; unit: string } | null }

export async function getWriteoffs(): Promise<WriteoffWithFlower[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("writeoffs")
    .select("*, flowers(name, unit)")
    .not("flower_id", "is", null)
    .order("writeoff_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200)
  return (data ?? []) as unknown as WriteoffWithFlower[]
}

export type FlowerBatch = {
  id: string
  arrived_at: string
  cost_price: number
  quantity_remaining: number
  expires_at: string | null
}

export type FlowerForWriteoff = {
  id: string
  name: string
  unit: string
  category: string
  current_stock: number
  batches: FlowerBatch[]
}

// Цветы с остатком + все их партии (для формы списания, без async per-row)
export async function getFlowersWithInventory(): Promise<FlowerForWriteoff[]> {
  const supabase = await createClient()

  const [flowersRes, stockRes, itemsRes] = await Promise.all([
    supabase.from("flowers").select("id, name, unit, category").eq("is_active", true).order("name"),
    supabase.from("flower_stock").select("flower_id, current_stock"),
    supabase
      .from("inventory_items")
      .select("id, flower_id, arrived_at, cost_price, quantity_remaining, expires_at")
      .gt("quantity_remaining", 0)
      .order("arrived_at", { ascending: true }),
  ])

  const stockMap = new Map(
    (stockRes.data ?? []).map((s) => [s.flower_id, Number(s.current_stock ?? 0)])
  )

  const batchMap = new Map<string, FlowerBatch[]>()
  for (const item of itemsRes.data ?? []) {
    if (!batchMap.has(item.flower_id)) batchMap.set(item.flower_id, [])
    batchMap.get(item.flower_id)!.push({
      id: item.id,
      arrived_at: item.arrived_at,
      cost_price: item.cost_price ?? 0,
      quantity_remaining: item.quantity_remaining ?? 0,
      expires_at: item.expires_at ?? null,
    })
  }

  return (flowersRes.data ?? [])
    .map((f) => ({
      ...f,
      current_stock: stockMap.get(f.id) ?? 0,
      batches: batchMap.get(f.id) ?? [],
    }))
    .filter((f) => f.current_stock > 0 && f.batches.length > 0)
}

// Оставляем для обратной совместимости
export async function getFlowersWithStock() {
  return getFlowersWithInventory()
}

export async function getInventoryItemsForFlower(flowerId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("flower_id", flowerId)
    .gt("quantity_remaining", 0)
    .order("arrived_at", { ascending: true })
  return data ?? []
}

export type WriteoffLineData = {
  flower_id: string
  inventory_item_id: string
  quantity: number
  reason: string
  comment: string
  loss_amount: number
}

export async function createWriteoffAct(formData: {
  writeoff_date: string
  comment: string
  items: WriteoffLineData[]
}): Promise<{ error?: string }> {
  if (formData.items.length === 0) return { error: "Добавьте хотя бы один товар" }

  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "Организация не найдена" }

  for (const item of formData.items) {
    // Проверяем партию
    const { data: invItem } = await supabase
      .from("inventory_items")
      .select("quantity_remaining, cost_price")
      .eq("id", item.inventory_item_id)
      .single()

    if (!invItem) return { error: "Партия не найдена" }
    if (invItem.quantity_remaining < item.quantity) {
      return { error: `В партии только ${invItem.quantity_remaining} шт. Нельзя списать ${item.quantity}` }
    }

    // Запись списания
    const { data: writeoffRow, error: we } = await supabase
      .from("writeoffs")
      .insert({
        organization_id: orgId,
        flower_id: item.flower_id,
        inventory_item_id: item.inventory_item_id,
        quantity: item.quantity,
        reason: item.reason || null,
        comment: item.comment || formData.comment || null,
        writeoff_date: formData.writeoff_date,
        loss_amount: item.loss_amount > 0 ? item.loss_amount : null,
      })
      .select("id")
      .single()

    if (we || !writeoffRow) return { error: we?.message ?? "Ошибка создания списания" }

    // Движение в stock_movements
    const { error: me } = await supabase.from("stock_movements").insert({
      organization_id: orgId,
      flower_id: item.flower_id,
      inventory_item_id: item.inventory_item_id,
      quantity: -item.quantity,
      movement_type: "writeoff",
      source_type: "writeoff",
      source_id: writeoffRow.id,
      comment: item.reason || null,
    })
    if (me) return { error: me.message }

    // Обновляем остаток партии
    const { error: ue } = await supabase
      .from("inventory_items")
      .update({ quantity_remaining: invItem.quantity_remaining - item.quantity })
      .eq("id", item.inventory_item_id)
    if (ue) return { error: ue.message }
  }

  revalidatePath("/writeoffs")
  revalidatePath("/inventory")
  return {}
}

// Оставляем для обратной совместимости
export async function createWriteoff(formData: {
  flower_id: string
  inventory_item_id: string
  quantity: number
  reason: string
  comment: string
  writeoff_date: string
  loss_amount: number
}): Promise<{ error?: string }> {
  return createWriteoffAct({
    writeoff_date: formData.writeoff_date,
    comment: formData.comment,
    items: [{
      flower_id: formData.flower_id,
      inventory_item_id: formData.inventory_item_id,
      quantity: formData.quantity,
      reason: formData.reason,
      comment: formData.comment,
      loss_amount: formData.loss_amount,
    }],
  })
}
