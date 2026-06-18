import { getPurchasesList } from "@/app/actions/purchases"
import { PurchasesListClient } from "@/components/purchases/PurchasesListClient"

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const sp = await searchParams
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const selectedMonth = sp.month ?? defaultMonth

  const rows = await getPurchasesList()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Поставки</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Поступление товара от поставщиков</p>
      </div>

      <PurchasesListClient rows={rows} selectedMonth={selectedMonth} />
    </div>
  )
}
