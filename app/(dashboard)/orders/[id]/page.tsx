import { notFound } from "next/navigation"
import { getOrder } from "@/app/actions/orders"
import { getFlowersForBuilder } from "@/app/actions/builder"
import { OrderForm } from "@/components/orders/OrderForm"
import { OrderStatusActions } from "@/components/orders/OrderStatusActions"
import { OrderStockWriteOff } from "@/components/orders/OrderStockWriteOff"
import { OrderDetailShell } from "@/components/orders/OrderDetailShell"
import { WhatsAppButton } from "@/components/orders/WhatsAppButton"
import Link from "next/link"
import { ArrowLeft, Phone } from "lucide-react"

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: "Новый", className: "bg-[var(--bg-subtle)] text-[var(--text-secondary)]" },
  in_progress: { label: "В работе", className: "bg-[var(--warn-bg)] text-[var(--warn-text)]" },
  ready: { label: "Готов", className: "bg-[var(--sage-bg)] text-[var(--sage-text)]" },
  delivered: { label: "Выдан", className: "bg-[var(--sage-bg)] text-[var(--sage-text)]" },
  cancelled: { label: "Отменён", className: "bg-[var(--brand-accent-bg)] text-[var(--brand-accent-text)]" },
}

const paymentConfig: Record<string, { label: string; className: string }> = {
  unpaid: { label: "Не оплачен", className: "bg-[var(--brand-accent-bg)] text-[var(--brand-accent-text)]" },
  partial: { label: "Частично", className: "bg-[var(--warn-bg)] text-[var(--warn-text)]" },
  paid: { label: "Оплачен", className: "bg-[var(--sage-bg)] text-[var(--sage-text)]" },
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [order, flowers] = await Promise.all([getOrder(id), getFlowersForBuilder()])
  if (!order) notFound()

  const status = statusConfig[order.status] ?? { label: order.status, className: "bg-[var(--bg-subtle)] text-[var(--text-secondary)]" }
  const payment = paymentConfig[order.payment_status ?? "unpaid"]
  const total = order.total_amount ?? 0
  const paid = order.paid_amount ?? 0

  return (
    <div className="space-y-5">
      {/* Шапка */}
      <div className="flex items-center gap-3">
        <Link
          href="/orders"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-heading)] transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <h1 className="text-xl font-semibold text-[var(--text-heading)]">
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
                className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-heading)]"
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

      <OrderDetailShell>
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
      </OrderDetailShell>
    </div>
  )
}
