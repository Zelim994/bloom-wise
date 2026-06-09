import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Phone, MapPin, Calendar, MessageSquare, CreditCard } from "lucide-react"
import { getOrder } from "@/app/actions/orders"
import { OrderStatusActions } from "@/components/orders/OrderStatusActions"
import { WhatsAppButton } from "@/components/orders/WhatsAppButton"

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: "Новый", className: "bg-blue-100 text-blue-700" },
  in_progress: { label: "В работе", className: "bg-amber-100 text-amber-700" },
  ready: { label: "Готов", className: "bg-emerald-100 text-emerald-700" },
  delivered: { label: "Выдан", className: "bg-zinc-100 text-zinc-500" },
  cancelled: { label: "Отменён", className: "bg-red-100 text-red-600" },
}

const paymentConfig: Record<string, { label: string; className: string }> = {
  unpaid: { label: "Не оплачен", className: "bg-red-100 text-red-600" },
  partial: { label: "Частично оплачен", className: "bg-amber-100 text-amber-700" },
  paid: { label: "Оплачен", className: "bg-emerald-100 text-emerald-700" },
}

const typeLabels: Record<string, { label: string; icon: string }> = {
  pickup: { label: "Самовывоз", icon: "🏪" },
  delivery: { label: "Доставка", icon: "🚚" },
  event: { label: "Мероприятие", icon: "🎉" },
}

const methodLabels: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  transfer: "Перевод",
}

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const order = await getOrder(params.id)
  if (!order) redirect("/orders")

  const status = statusConfig[order.status] ?? { label: order.status, className: "bg-zinc-100 text-zinc-500" }
  const payment = paymentConfig[order.payment_status ?? "unpaid"]
  const typeInfo = typeLabels[order.type ?? "pickup"]
  const total = order.total_amount ?? 0
  const paid = order.paid_amount ?? 0
  const remaining = total - paid

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Шапка */}
      <div className="flex items-start gap-3">
        <Link
          href="/orders"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors mt-0.5 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold text-zinc-900">
              {order.order_number ?? "Заказ"}
            </h1>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.className}`}>
              {status.label}
            </span>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${payment.className}`}>
              {payment.label}
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            {order.order_date
              ? new Date(order.order_date).toLocaleDateString("ru", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : ""}
          </p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Клиент */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
            <span className="text-base">👤</span> Клиент
          </h2>
          <div>
            <p className="font-medium text-zinc-800">
              {order.customers?.full_name ?? "Без имени"}
            </p>
            {order.customers?.phone && (
              <div className="flex items-center gap-3 mt-1">
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
          {order.customer_comment && (
            <div className="flex gap-2 rounded-lg bg-zinc-50 px-3 py-2.5">
              <MessageSquare className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
              <p className="text-sm text-zinc-600">{order.customer_comment}</p>
            </div>
          )}
        </div>

        {/* Детали */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
            <span className="text-base">📋</span> Детали заказа
          </h2>
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">{typeInfo.icon}</span>
              <span className="text-zinc-700">{typeInfo.label}</span>
            </div>
            {order.ready_at && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-zinc-400" />
                <span className="text-zinc-700">
                  {new Date(order.ready_at).toLocaleString("ru", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            )}
            {order.delivery_address && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                <span className="text-zinc-700">{order.delivery_address}</span>
              </div>
            )}
          </div>
          {order.florist_comment && (
            <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5">
              <MessageSquare className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900">{order.florist_comment}</p>
            </div>
          )}
        </div>
      </div>

      {/* Финансы */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700 flex items-center gap-2 mb-4">
          <CreditCard className="h-4 w-4 text-zinc-400" /> Финансы
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Сумма</p>
            <p className="text-lg font-bold text-zinc-800 mt-1 tabular-nums">
              ₽ {(order.subtotal ?? 0).toLocaleString("ru", { maximumFractionDigits: 0 })}
            </p>
          </div>
          {(order.delivery_cost ?? 0) > 0 && (
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Доставка</p>
              <p className="text-lg font-bold text-zinc-800 mt-1 tabular-nums">
                ₽ {order.delivery_cost!.toLocaleString("ru", { maximumFractionDigits: 0 })}
              </p>
            </div>
          )}
          {(order.discount ?? 0) > 0 && (
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Скидка</p>
              <p className="text-lg font-bold text-emerald-600 mt-1 tabular-nums">
                −₽ {order.discount!.toLocaleString("ru", { maximumFractionDigits: 0 })}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Итого</p>
            <p className="text-lg font-bold text-zinc-900 mt-1 tabular-nums">
              ₽ {total.toLocaleString("ru", { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Получено</p>
            <p className="text-lg font-bold text-emerald-600 mt-1 tabular-nums">
              ₽ {paid.toLocaleString("ru", { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Остаток</p>
            <p className={`text-lg font-bold mt-1 tabular-nums ${remaining > 0 ? "text-red-600" : "text-zinc-400"}`}>
              {remaining > 0
                ? `₽ ${remaining.toLocaleString("ru", { maximumFractionDigits: 0 })}`
                : "—"}
            </p>
          </div>
          {order.payment_method && (
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Способ</p>
              <p className="text-sm font-medium text-zinc-700 mt-1">
                {methodLabels[order.payment_method] ?? order.payment_method}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
