import { getPurchasesList } from "@/app/actions/purchases"
import { PurchasesListClient } from "@/components/purchases/PurchasesListClient"

export default async function PurchasesPage() {
  const rows = await getPurchasesList()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Поставки</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Поступление товара от поставщиков</p>
        </div>
      </div>

      <PurchasesListClient rows={rows} />
    </div>
  )
}
