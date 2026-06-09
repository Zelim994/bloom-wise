import { getStockFlowers } from "@/app/actions/inventory"
import { InventoryTable } from "@/components/inventory/InventoryTable"

export default async function InventoryPage() {
  const flowers = await getStockFlowers()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Склад</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Товары в наличии — только то, что сейчас есть на складе
        </p>
      </div>
      <InventoryTable flowers={flowers} />
    </div>
  )
}
