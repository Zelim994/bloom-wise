"use server"

import { createClient } from "@/lib/supabase/server"
import type { FlowerForBuilder } from "@/types/builder"

export type { FlowerForBuilder } from "@/types/builder"

function stockKey(flowerId: string, varietyId: string | null, colorId: string | null): string {
  return `${flowerId}:${varietyId ?? "none"}:${colorId ?? "none"}`
}

export async function getFlowersForBuilder(): Promise<FlowerForBuilder[]> {
  const supabase = await createClient()

  const [variantStockRes, salePricesRes, itemsRes] = await Promise.all([
    supabase
      .from("flower_variant_stock")
      .select(
        "flower_id, variety_id, color_id, flower_name, flower_unit, flower_category, variety_name, variety_size, color_name, current_stock"
      )
      .order("flower_category")
      .order("flower_name"),
    supabase
      .from("flowers")
      .select("id, sale_price")
      .eq("is_active", true),
    supabase
      .from("inventory_items")
      .select("flower_id, variety_id, color_id, cost_price")
      .gt("quantity_remaining", 0)
      .order("arrived_at", { ascending: true }),
  ])

  const salePriceMap = new Map<string, number | null>(
    (salePricesRes.data ?? []).map((f) => [f.id, f.sale_price])
  )

  // FIFO: первая запись по (flower_id, variety_id, color_id) = старейшая партия
  const costMap = new Map<string, number>()
  for (const item of itemsRes.data ?? []) {
    const key = stockKey(item.flower_id, item.variety_id, item.color_id)
    if (!costMap.has(key)) {
      costMap.set(key, item.cost_price)
    }
  }

  return (variantStockRes.data ?? [])
    .filter((row) => (row.current_stock ?? 0) > 0)
    .map((row) => {
      const fid = row.flower_id!
      const key = stockKey(fid, row.variety_id, row.color_id)
      return {
        id: key,
        flower_id: fid,
        name: row.flower_name ?? "",
        unit: row.flower_unit ?? "шт",
        category: row.flower_category ?? "",
        variety_id: row.variety_id ?? null,
        variety_name: row.variety_name ?? null,
        variety_size: row.variety_size ?? null,
        color_id: row.color_id ?? null,
        color_name: row.color_name ?? null,
        current_stock: row.current_stock ?? 0,
        unit_cost: costMap.get(key) ?? 0,
        sale_price: salePriceMap.get(fid) ?? null,
      }
    })
}
