import { getFlowersForPurchase, getSuppliers } from "@/app/actions/purchases"
import { PurchaseForm } from "@/components/purchases/PurchaseForm"

export default async function NewPurchasePage() {
  const [flowers, suppliers] = await Promise.all([
    getFlowersForPurchase(),
    getSuppliers(),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Новая поставка</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Оформление поступления товара от поставщика</p>
      </div>
      <PurchaseForm flowers={flowers} suppliers={suppliers} />
    </div>
  )
}
