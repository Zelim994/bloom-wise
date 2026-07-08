import { notFound } from "next/navigation"
import { getPurchaseDetail, getSuppliers } from "@/app/actions/purchases"
import { EditPurchaseForm } from "@/components/purchases/EditPurchaseForm"

export default async function EditPurchasePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [purchase, suppliers] = await Promise.all([
    getPurchaseDetail(id),
    getSuppliers(),
  ])

  if (!purchase) notFound()

  return (
    <div className="max-w-5xl mx-auto">
      <EditPurchaseForm purchase={purchase} suppliers={suppliers} />
    </div>
  )
}
