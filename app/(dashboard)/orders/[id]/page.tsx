import { notFound } from "next/navigation"
import { getOrder } from "@/app/actions/orders"
import { getFlowersForBuilder } from "@/app/actions/builder"
import { OrderForm } from "@/components/orders/OrderForm"
import { OrderStatusActions } from "@/components/orders/OrderStatusActions"
import { OrderStockWriteOff } from "@/components/orders/OrderStockWriteOff"
import { WhatsAppButton } from "@/components/orders/WhatsAppButton"
import Link from "next/link"
import { ArrowLeft, Phone } from "lucide-react"

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: "Новый", className: "bg-blue-100 text-blue-700" },
  in_progress: { label: "В работе", className: "bg-amber-100 text-amber-700" },
  ready: { label: "Готов", className: "bg-emerald-100 text-emerald-700" },
  delivered: { label: "Выдан", className: "bg-zinc-100 text-zinc-500" },
  cancelled: { label: "Отменён", className: "bg-red-100 text-red-600" },
}

const paymentConfig: Record<string, { label: string; className: string }> = {
  unpaid: { label: "Не оплачен", className: "bg-red-100 text-red-600" },
  partial: { label: "Частично", className: "bg-amber-100 text-amber-700" },
  paid: { label: "Оплачен", className: "bg-emerald-100 text-emerald-700" },
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [order, flowers] = await Promise.all([getOrder(id), getFlowersForBuilder()])
  if (!order) notFound()

  const status = statusConfig[order.status] ?? { label: order.status, className: "bg-zinc-100 text-zinc-500" }
  const payment = paymentConfig[order.payment_status ?? "unpaid"]
  const total = order.total_amount ?? 0
  const paid = order.paid_amount ?? 0

  return (
    <div className="space-y-5">
      {/* Шапка */}
      <div className="flex items-center gap-3">
        <Link
          href="/orders"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <h1 className="text-xl font-semibold text-zinc-900">
            {order.order_number ?? "Заказ"}
          </h1>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.className}`}>
            {status.label}
          </span>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${payment.className}`}>
            {payment.label}
          </span>
          {order.customers?.phone && (
            <div className="ml-auto flex items-center gap-2">
              <a
                href={`tel:${order.customers.phone}`}
                className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700"
              >
                <Phone className="h-3.5 w-3.5" />
                {order.customers.phone}
              </a>
              <WhatsAppButton
                orderId={order.id}
                phone={order.customers.phone}
                orderNumber={order.order_number ?? ""}
                totalAmount={total}
                readyAt={order.ready_at ?? null}
                customerName={order.customers.full_name}
                alreadySent={order.whatsapp_sent ?? false}
              />
            </div>
          )}
        </div>
      </div>

      {/* Кнопки статуса */}
      <OrderStatusActions
        orderId={order.id}
        status={order.status as "new" | "in_progress" | "ready" | "delivered" | "cancelled"}
        totalAmount={total}
        paidAmount={paid}
        paymentMethod={order.payment_method}
      />

      {/* Списание склада */}
      <OrderStockWriteOff
        orderId={order.id}
        stockWrittenOff={order.stock_written_off}
        stockReturned={order.stock_returned}
        status={order.status}
      />

      {/* Форма редактирования */}
      <OrderForm flowers={flowers} initialData={order} />
    </div>
  )
}
