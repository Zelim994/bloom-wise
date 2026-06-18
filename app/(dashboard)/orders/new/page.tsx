import { getFlowersForBuilder } from "@/app/actions/builder"
import { OrderForm } from "@/components/orders/OrderForm"

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ order_date?: string }>
}) {
  const { order_date: rawDate } = await searchParams
  const initialOrderDate =
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : undefined

  const flowers = await getFlowersForBuilder()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Новый заказ</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Заполните данные клиента и соберите букет</p>
      </div>
      <OrderForm flowers={flowers} initialOrderDate={initialOrderDate} />
    </div>
  )
}
