import type { StockRow } from "@/components/stock/StockTableClient"
import type { FlowerVariantStock } from "@/lib/supabase/types"
import type { createClient } from "@/lib/supabase/server"
import { getInventoryStatus } from "@/lib/inventory/status"

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function getInventoryRows(supabase: SupabaseClient): Promise<{
  rows: StockRow[]
  activeFlowerIds: Set<string>
}> {
  const today = new Date()

  const [variantRes, batchesRes, flowersRes] = await Promise.all([
    supabase
      .from("flower_variant_stock")
      .select("flower_id, variety_id, color_id, flower_name, flower_unit, flower_category, variety_name, variety_size, color_name, current_stock"),
    supabase
      .from("inventory_items")
      .select("flower_id, variety_id, color_id, arrived_at, quantity_remaining, cost_price")
      .gt("quantity_remaining", 0)
      .order("arrived_at", { ascending: true }),
    supabase
      .from("flowers")
      .select("id, min_stock")
      .eq("is_active", true),
  ])

  // min_stock is flower-level — applied to all variants of that flower
  const minStockMap = new Map<string, number>(
    (flowersRes.data ?? []).map((f) => [f.id as string, f.min_stock ?? 0])
  )
  const activeFlowerIds = new Set<string>(
    (flowersRes.data ?? []).map((f) => f.id as string)
  )

  // Oldest batch per (flower_id, variety_id, color_id) — batches already sorted ASC
  const batchMap = new Map<string, { arrived_at: string; cost_price: number }>()
  for (const b of batchesRes.data ?? []) {
    const key = `${b.flower_id}|${b.variety_id ?? ""}|${b.color_id ?? ""}`
    if (!batchMap.has(key)) {
      batchMap.set(key, { arrived_at: b.arrived_at, cost_price: b.cost_price })
    }
  }

  const rows: StockRow[] = ((variantRes.data ?? []) as FlowerVariantStock[]).map((v) => {
    const batchKey = `${v.flower_id}|${v.variety_id ?? ""}|${v.color_id ?? ""}`
    const batch    = batchMap.get(batchKey)
    const minStock = minStockMap.get(v.flower_id ?? "") ?? 0
    const stock    = v.current_stock ?? 0
    const daysOnShelf = batch
      ? Math.floor((today.getTime() - new Date(batch.arrived_at + "T00:00:00").getTime()) / 86_400_000)
      : null

    return {
      flower_id:         v.flower_id      ?? "",
      variety_id:        v.variety_id     ?? null,
      color_id:          v.color_id       ?? null,
      name:              v.flower_name    ?? "",
      variety_name:      v.variety_name   ?? null,
      variety_size:      v.variety_size   ?? null,
      color_name:        v.color_name     ?? null,
      category:          v.flower_category ?? "",
      unit:              v.flower_unit    ?? "шт",
      min_stock:         minStock > 0 ? minStock : null,
      current_stock:     stock,
      oldest_arrived_at: batch?.arrived_at    ?? null,
      oldest_cost_price: batch?.cost_price    ?? null,
      days_on_shelf:     daysOnShelf,
      status:            getInventoryStatus(stock, minStock > 0 ? minStock : null, daysOnShelf),
    }
  })

  return { rows, activeFlowerIds }
}
