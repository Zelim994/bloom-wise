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
  variety_id: string | null
  variety_name: string | null
  variety_size: string | null
  color_id: string | null
  color_name: string | null
}

export type FlowerForWriteoff = {
  // position_key = "flower_id:variety_id:color_id" — только для UI-навигации
  position_key: string
  // настоящий UUID цветка — используется при проведении списания
  flower_id: string
  name: string
  unit: string
  category: string
  variety_id: string | null
  variety_name: string | null
  variety_size: string | null
  color_id: string | null
  color_name: string | null
  current_stock: number
  batches: FlowerBatch[]
}

// Складские позиции по (flower_id + variety_id + color_id) — для формы списания
export async function getFlowersWithInventory(): Promise<FlowerForWriteoff[]> {
  const supabase = await createClient()

  const [variantStockRes, itemsRes] = await Promise.all([
    // flower_variant_stock уже содержит variety_name, variety_size, color_name и current_stock
    supabase
      .from("flower_variant_stock")
      .select(
        "flower_id, variety_id, color_id, flower_name, flower_unit, flower_category, variety_name, variety_size, color_name, current_stock"
      ),
    supabase
      .from("inventory_items")
      .select("id, flower_id, variety_id, color_id, arrived_at, cost_price, quantity_remaining, expires_at")
      .gt("quantity_remaining", 0)
      .order("arrived_at", { ascending: true }),
  ])

  // Строим map позиций из flower_variant_stock
  type PositionMeta = {
    flower_id: string
    name: string
    unit: string
    category: string
    variety_id: string | null
    variety_name: string | null
    variety_size: string | null
    color_id: string | null
    color_name: string | null
    current_stock: number
  }

  const positionMap = new Map<string, PositionMeta>()
  for (const row of variantStockRes.data ?? []) {
    const key = `${row.flower_id}:${row.variety_id ?? "none"}:${row.color_id ?? "none"}`
    if (!row.flower_id) continue
    positionMap.set(key, {
      flower_id: row.flower_id,
      name: row.flower_name ?? "",
      unit: row.flower_unit ?? "",
      category: row.flower_category ?? "",
      variety_id: row.variety_id ?? null,
      variety_name: row.variety_name ?? null,
      variety_size: row.variety_size ?? null,
      color_id: row.color_id ?? null,
      color_name: row.color_name ?? null,
      current_stock: Number(row.current_stock ?? 0),
    })
  }

  // Группируем партии по position_key; variety/color берём из positionMap
  const batchMap = new Map<string, FlowerBatch[]>()
  for (const item of itemsRes.data ?? []) {
    const key = `${item.flower_id}:${item.variety_id ?? "none"}:${item.color_id ?? "none"}`
    const pos = positionMap.get(key)
    if (!batchMap.has(key)) batchMap.set(key, [])
    batchMap.get(key)!.push({
      id: item.id,
      arrived_at: item.arrived_at,
      cost_price: item.cost_price ?? 0,
      quantity_remaining: item.quantity_remaining ?? 0,
      expires_at: item.expires_at ?? null,
      variety_id: item.variety_id ?? null,
      variety_name: pos?.variety_name ?? null,
      variety_size: pos?.variety_size ?? null,
      color_id: item.color_id ?? null,
      color_name: pos?.color_name ?? null,
    })
  }

  const result: FlowerForWriteoff[] = []
  for (const [key, pos] of positionMap.entries()) {
    const batches = batchMap.get(key) ?? []
    if (pos.current_stock <= 0 || batches.length === 0) continue
    result.push({
      position_key: key,
      flower_id: pos.flower_id,
      name: pos.name,
      unit: pos.unit,
      category: pos.category,
      variety_id: pos.variety_id,
      variety_name: pos.variety_name,
      variety_size: pos.variety_size,
      color_id: pos.color_id,
      color_name: pos.color_name,
      current_stock: pos.current_stock,
      batches,
    })
  }

  // Сортировка: по имени, потом по размеру
  return result.sort((a, b) => {
    const nc = a.name.localeCompare(b.name, "ru")
    if (nc !== 0) return nc
    return (a.variety_size ?? "").localeCompare(b.variety_size ?? "")
  })
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
      .select("quantity_remaining, cost_price, variety_id, color_id")
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

    // Движение в stock_movements — variety/color берём из inventory_items, не из формы
    const { error: me } = await supabase.from("stock_movements").insert({
      organization_id: orgId,
      flower_id: item.flower_id,
      inventory_item_id: item.inventory_item_id,
      quantity: -item.quantity,
      movement_type: "writeoff",
      source_type: "writeoff",
      source_id: writeoffRow.id,
      comment: item.reason || null,
      variety_id: invItem.variety_id ?? null,
      color_id: invItem.color_id ?? null,
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
