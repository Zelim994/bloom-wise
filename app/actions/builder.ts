"use server"

import { createClient } from "@/lib/supabase/server"
import type { FlowerForBuilder } from "@/types/builder"

export type { FlowerForBuilder } from "@/types/builder"

export async function getFlowersForBuilder(): Promise<FlowerForBuilder[]> {
  const supabase = await createClient()

  const [flowersRes, stockRes, itemsRes] = await Promise.all([
    supabase
      .from("flowers")
      .select("id, name, unit, category, sale_price")
      .eq("is_active", true)
      .order("category")
      .order("name"),
    supabase.from("flower_stock").select("flower_id, current_stock"),
    supabase
      .from("inventory_items")
      .select("flower_id, cost_price")
      .gt("quantity_remaining", 0)
      .order("arrived_at", { ascending: true }),
  ])

  const flowers = flowersRes.data ?? []
  const stockMap = new Map(
    (stockRes.data ?? []).map((s) => [s.flower_id, Number(s.current_stock ?? 0)])
  )

  // FIFO: first entry per flower_id = oldest batch
  const costMap = new Map<string, number>()
  for (const item of itemsRes.data ?? []) {
    if (!costMap.has(item.flower_id)) {
      costMap.set(item.flower_id, item.cost_price)
    }
  }

  return flowers
    .map((f) => ({
      ...f,
      current_stock: stockMap.get(f.id) ?? 0,
      unit_cost: costMap.get(f.id) ?? 0,
      sale_price: f.sale_price ?? null,
    }))
    .filter((f) => f.current_stock > 0)
}
