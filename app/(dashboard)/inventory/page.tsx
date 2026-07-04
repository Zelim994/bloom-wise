import { createClient } from "@/lib/supabase/server"
import { StockTableClient } from "@/components/stock/StockTableClient"
import { getInventoryRows } from "@/lib/inventory/rows"

export default async function InventoryPage() {
  const supabase = await createClient()
  const { rows } = await getInventoryRows(supabase)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Склад</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Остатки по вариантам · FIFO</p>
        </div>
      </div>

      <StockTableClient rows={rows} />
    </div>
  )
}
