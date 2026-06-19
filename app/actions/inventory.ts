"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Flower, InventoryItem, StockMovement } from "@/lib/supabase/types"
import { getOrgId } from "@/lib/services/organizationService"

export type FlowerWithStock = Flower & { current_stock: number }

// Товары в наличии (current_stock > 0) для страницы /inventory
export async function getStockFlowers(): Promise<FlowerWithStock[]> {
  const supabase = await createClient()
  const [flowersRes, stockRes] = await Promise.all([
    supabase.from("flowers").select("*").eq("is_active", true).order("name"),
    supabase.from("flower_stock").select("*"),
  ])
  const flowers = flowersRes.data ?? []
  const stockMap = new Map(
    (stockRes.data ?? []).map((s) => [s.flower_id, Number(s.current_stock ?? 0)])
  )
  return flowers
    .map((f) => ({ ...f, current_stock: stockMap.get(f.id) ?? 0 }))
    .filter((f) => f.current_stock > 0)
}

// Все цветы с остатком (в т.ч. 0) — для списаний
export async function getAllFlowersWithStock(): Promise<FlowerWithStock[]> {
  const supabase = await createClient()
  const [flowersRes, stockRes] = await Promise.all([
    supabase.from("flowers").select("*").eq("is_active", true).order("name"),
    supabase.from("flower_stock").select("*"),
  ])
  const flowers = flowersRes.data ?? []
  const stockMap = new Map(
    (stockRes.data ?? []).map((s) => [s.flower_id, Number(s.current_stock ?? 0)])
  )
  return flowers
    .map((f) => ({ ...f, current_stock: stockMap.get(f.id) ?? 0 }))
    .filter((f) => f.current_stock > 0)
}

export async function getFlowerById(id: string): Promise<FlowerWithStock | null> {
  const supabase = await createClient()
  const [flowerRes, stockRes] = await Promise.all([
    supabase.from("flowers").select("*").eq("id", id).single(),
    supabase.from("flower_stock").select("current_stock").eq("flower_id", id).maybeSingle(),
  ])
  if (!flowerRes.data) return null
  return { ...flowerRes.data, current_stock: Number(stockRes.data?.current_stock ?? 0) }
}

export type InventoryItemWithVariant = {
  id:                 string
  arrived_at:         string
  quantity_in:        number
  quantity_remaining: number
  cost_price:         number
  expires_at:         string | null
  freshness_status:   string | null
  comment:            string | null
  variety_id:         string | null
  color_id:           string | null
  variety_name:       string | null
  variety_size:       string | null
  color_name:         string | null
}

// Партии товара (FIFO — старые первые) с вариантом и цветом
export async function getFlowerInventoryItems(flowerId: string): Promise<InventoryItemWithVariant[]> {
  const supabase = await createClient()
  type RawItem = {
    id: string; arrived_at: string; quantity_in: number; quantity_remaining: number
    cost_price: number; expires_at: string | null; freshness_status: string | null
    comment: string | null; variety_id: string | null; color_id: string | null
    flower_varieties: { name: string; size: string | null } | null
    flower_colors:    { name: string } | null
  }
  const { data } = await supabase
    .from("inventory_items")
    .select(`
      id, arrived_at, quantity_in, quantity_remaining, cost_price,
      expires_at, freshness_status, comment,
      variety_id, color_id,
      flower_varieties(name, size),
      flower_colors(name)
    `)
    .eq("flower_id", flowerId)
    .gt("quantity_remaining", 0)
    .order("arrived_at", { ascending: true })
  return ((data ?? []) as unknown as RawItem[]).map((item) => ({
    id:                 item.id,
    arrived_at:         item.arrived_at,
    quantity_in:        item.quantity_in,
    quantity_remaining: item.quantity_remaining,
    cost_price:         item.cost_price,
    expires_at:         item.expires_at   ?? null,
    freshness_status:   item.freshness_status ?? null,
    comment:            item.comment      ?? null,
    variety_id:         item.variety_id   ?? null,
    color_id:           item.color_id     ?? null,
    variety_name:       item.flower_varieties?.name ?? null,
    variety_size:       item.flower_varieties?.size ?? null,
    color_name:         item.flower_colors?.name    ?? null,
  }))
}

// История движений по цветку
export async function getFlowerMovements(flowerId: string): Promise<StockMovement[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("flower_id", flowerId)
    .order("created_at", { ascending: false })
    .limit(100)
  return data ?? []
}

// ─── flower info fields that can be edited ───────────────────────────────────
export type FlowerInfoUpdate = {
  name: string
  category: string
  sku: string | null
  unit: string
  min_stock: number | null
  sale_price: number | null
  description: string | null
}

const FIELD_LABELS: Record<keyof FlowerInfoUpdate, string> = {
  name: "Название",
  category: "Категория",
  sku: "SKU",
  unit: "Единица измерения",
  min_stock: "Мин. остаток",
  sale_price: "Цена продажи",
  description: "Описание",
}

export async function updateFlowerInfo(
  flowerId: string,
  updates: FlowerInfoUpdate,
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Не авторизован" }

  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "Организация не найдена" }

  // Validate
  if (!updates.name.trim()) return { error: "Название не может быть пустым" }
  if (!updates.category.trim()) return { error: "Категория не может быть пустой" }
  if (!updates.unit.trim()) return { error: "Единица не может быть пустой" }
  if (updates.min_stock !== null && updates.min_stock < 0) return { error: "Мин. остаток не может быть отрицательным" }
  if (updates.sale_price !== null && updates.sale_price < 0) return { error: "Цена не может быть отрицательной" }

  // Fetch current flower (org-scoped — double protection over RLS)
  const { data: current } = await supabase
    .from("flowers")
    .select("name, category, sku, unit, min_stock, sale_price, description")
    .eq("id", flowerId)
    .eq("organization_id", orgId)
    .single()

  if (!current) return { error: "Позиция не найдена или нет доступа" }

  // Apply update
  const { error: updateError } = await supabase
    .from("flowers")
    .update({
      name:        updates.name.trim(),
      category:    updates.category.trim(),
      sku:         updates.sku?.trim() || null,
      unit:        updates.unit.trim(),
      min_stock:   updates.min_stock,
      sale_price:  updates.sale_price,
      description: updates.description?.trim() || null,
      updated_at:  new Date().toISOString(),
    })
    .eq("id", flowerId)
    .eq("organization_id", orgId)

  if (updateError) return { error: updateError.message }

  // Build change log — only actually changed fields
  type ChangeEntry = { field: string; label: string; old: string; new_val: string }
  const changes: ChangeEntry[] = []

  const str = (v: string | number | null | undefined) =>
    v == null || v === "" ? "—" : String(v)

  const check = (field: keyof FlowerInfoUpdate) => {
    const oldVal = current[field as keyof typeof current]
    const newVal = updates[field]
    const oldStr = str(oldVal)
    const newStr = str(newVal)
    if (oldStr !== newStr) {
      changes.push({ field, label: FIELD_LABELS[field], old: oldStr, new_val: newStr })
    }
  }

  ;(Object.keys(FIELD_LABELS) as Array<keyof FlowerInfoUpdate>).forEach(check)

  if (changes.length > 0) {
    await supabase.from("activity_logs").insert({
      action:         "flower_updated",
      entity_type:    "flower",
      entity_id:      flowerId,
      organization_id: orgId,
      user_id:        user.id,
      changes,
    })
  }

  revalidatePath("/inventory")
  revalidatePath(`/inventory/${flowerId}`)
  return {}
}

export async function getFlowerActivityLogs(flowerId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("activity_logs")
    .select("id, created_at, user_id, changes, profiles!user_id(full_name)")
    .eq("entity_type", "flower")
    .eq("entity_id", flowerId)
    .order("created_at", { ascending: false })
    .limit(50)
  return (data ?? []) as Array<{
    id: string
    created_at: string
    user_id: string | null
    changes: unknown
    profiles: { full_name: string | null } | null
  }>
}

export async function archiveFlower(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("flowers")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/inventory")
  revalidatePath("/catalog")
  return {}
}
