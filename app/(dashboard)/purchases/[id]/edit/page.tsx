import { redirect } from "next/navigation"
import { getPurchaseDetail, getSuppliers } from "@/app/actions/purchases"
import { EditPurchaseForm } from "@/components/purchases/EditPurchaseForm"

export default async function EditPurchasePage({
  params,
}: {
  params: { id: string }
}) {
  const [purchase, suppliers] = await Promise.all([
    getPurchaseDetail(params.id),
    getSuppliers(),
  ])

  if (!purchase) redirect("/purchases")

  return (
    <div className="max-w-5xl mx-auto">
      <EditPurchaseForm purchase={purchase} suppliers={suppliers} />
    </div>
  )
}
