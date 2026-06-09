import { getFlowersForBuilder } from "@/app/actions/builder"
import { OrderForm } from "@/components/orders/OrderForm"

export default async function NewOrderPage() {
  const flowers = await getFlowersForBuilder()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Новый заказ</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Заполните данные клиента и соберите букет</p>
      </div>
      <OrderForm flowers={flowers} />
    </div>
  )
}
