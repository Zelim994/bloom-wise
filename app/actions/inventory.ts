"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Flower, InventoryItem, StockMovement } from "@/lib/supabase/types"

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

// Партии товара (FIFO — старые первые)
export async function getFlowerInventoryItems(flowerId: string): Promise<InventoryItem[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("flower_id", flowerId)
    .gt("quantity_remaining", 0)
    .order("arrived_at", { ascending: true })
  return data ?? []
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
