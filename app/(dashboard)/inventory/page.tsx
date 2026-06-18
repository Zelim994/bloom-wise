import { createClient } from "@/lib/supabase/server"
import { StockTableClient, type StockRow } from "@/components/stock/StockTableClient"

// Low stock threshold when min_stock is not set
const DEFAULT_LOW_THRESHOLD = 5
// Days on shelf before considered "aging"
const AGING_DAYS = 7

function computeStatus(
  stock: number,
  minStock: number | null,
  daysOnShelf: number | null,
): StockRow["status"] {
  if (stock <= 0) return "no_stock"
  const threshold = minStock && minStock > 0 ? minStock : DEFAULT_LOW_THRESHOLD
  if (stock <= threshold) return "low"
  if (daysOnShelf !== null && daysOnShelf >= AGING_DAYS) return "aging"
  return "ok"
}

export default async function InventoryPage() {
  const supabase = await createClient()
  const today = new Date()

  const [flowersRes, stockRes, batchesRes] = await Promise.all([
    supabase
      .from("flowers")
      .select("id, name, category, sku, min_stock, sale_price, unit, description")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("flower_stock")
      .select("flower_id, current_stock"),
    supabase
      .from("inventory_items")
      .select("flower_id, arrived_at, quantity_remaining, cost_price")
      .gt("quantity_remaining", 0)
      .order("arrived_at", { ascending: true }),
  ])

  const flowers = flowersRes.data ?? []

  const stockMap = new Map<string, number>(
    (stockRes.data ?? []).map((s) => [s.flower_id as string, Number(s.current_stock ?? 0)])
  )

  // Keep only the oldest batch per flower (batches already sorted ASC by arrived_at)
  const batchMap = new Map<string, { arrived_at: string; cost_price: number }>()
  for (const b of batchesRes.data ?? []) {
    if (!batchMap.has(b.flower_id)) {
      batchMap.set(b.flower_id, { arrived_at: b.arrived_at, cost_price: b.cost_price })
    }
  }

  const rows: StockRow[] = flowers.map((f) => {
    const stock = stockMap.get(f.id) ?? 0
    const batch = batchMap.get(f.id)
    const daysOnShelf = batch
      ? Math.floor((today.getTime() - new Date(batch.arrived_at + "T00:00:00").getTime()) / 86_400_000)
      : null

    return {
      id: f.id,
      name: f.name,
      category: f.category,
      sku: f.sku ?? null,
      min_stock: f.min_stock ?? null,
      sale_price: f.sale_price ?? null,
      unit: f.unit,
      description: f.description ?? null,
      current_stock: stock,
      oldest_arrived_at: batch?.arrived_at ?? null,
      oldest_cost_price: batch?.cost_price ?? null,
      days_on_shelf: daysOnShelf,
      status: computeStatus(stock, f.min_stock ?? null, daysOnShelf),
    }
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Склад</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Остатки по партиям · FIFO</p>
        </div>
      </div>

      <StockTableClient rows={rows} />
    </div>
  )
}
