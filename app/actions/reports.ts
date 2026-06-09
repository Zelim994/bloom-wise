"use server"

import { createClient } from "@/lib/supabase/server"

export type MonthlyStats = {
  revenue: number
  paid: number
  orderCount: number
  avgCheck: number
  writeoffsLoss: number
  ordersByStatus: { status: string; count: number }[]
}

export type TopFlower = {
  flower_id: string
  name: string
  unit: string
  quantity: number
}

export async function getMonthlyStats(year: number, month: number): Promise<MonthlyStats> {
  const supabase = await createClient()

  const from = `${year}-${String(month).padStart(2, "0")}-01`
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`

  const [{ data: orders }, { data: writeoffs }] = await Promise.all([
    supabase
      .from("orders")
      .select("status, total_amount, paid_amount")
      .gte("order_date", from)
      .lt("order_date", nextMonth),
    supabase
      .from("writeoffs")
      .select("loss_amount")
      .gte("writeoff_date", from)
      .lt("writeoff_date", nextMonth),
  ])

  const active = (orders ?? []).filter((o) => o.status !== "cancelled")
  const revenue = active.reduce((s, o) => s + (o.total_amount ?? 0), 0)
  const paid = active.reduce((s, o) => s + (o.paid_amount ?? 0), 0)
  const orderCount = active.length
  const avgCheck = orderCount > 0 ? revenue / orderCount : 0
  const writeoffsLoss = (writeoffs ?? []).reduce((s, w) => s + (w.loss_amount ?? 0), 0)

  const statusCounts = new Map<string, number>()
  for (const o of active) {
    statusCounts.set(o.status, (statusCounts.get(o.status) ?? 0) + 1)
  }
  const ordersByStatus = [...statusCounts.entries()].map(([status, count]) => ({ status, count }))

  return { revenue, paid, orderCount, avgCheck, writeoffsLoss, ordersByStatus }
}

export async function getTopFlowers(): Promise<TopFlower[]> {
  const supabase = await createClient()

  const { data: items } = await supabase
    .from("bouquet_items")
    .select("flower_id, quantity")
    .not("flower_id", "is", null)
    .limit(5000)

  const qtyMap = new Map<string, number>()
  for (const item of items ?? []) {
    if (!item.flower_id) continue
    qtyMap.set(item.flower_id, (qtyMap.get(item.flower_id) ?? 0) + item.quantity)
  }

  const flowerIds = [...qtyMap.keys()]
  if (flowerIds.length === 0) return []

  const { data: flowers } = await supabase
    .from("flowers")
    .select("id, name, unit")
    .in("id", flowerIds)

  return (flowers ?? [])
    .map((f) => ({ flower_id: f.id, name: f.name, unit: f.unit, quantity: qtyMap.get(f.id) ?? 0 }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10)
}
