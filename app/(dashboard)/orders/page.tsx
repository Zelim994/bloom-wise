import Link from "next/link"
import { Plus, ClipboardList } from "lucide-react"
import { getOrders } from "@/app/actions/orders"
import { OrderStatusTabs } from "@/components/orders/OrderStatusTabs"

const VALID_STATUSES = ["new", "in_progress", "ready", "delivered", "cancelled"]

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: "Новый", className: "bg-blue-100 text-blue-700" },
  in_progress: { label: "В работе", className: "bg-amber-100 text-amber-700" },
  ready: { label: "Готов", className: "bg-emerald-100 text-emerald-700" },
  delivered: { label: "Выдан", className: "bg-zinc-100 text-zinc-500" },
  cancelled: { label: "Отменён", className: "bg-red-100 text-red-600" },
}

const paymentStatusConfig: Record<string, { label: string; className: string }> = {
  unpaid: { label: "Не оплачен", className: "text-red-600" },
  partial: { label: "Частично", className: "text-amber-600" },
  paid: { label: "Оплачен", className: "text-emerald-600" },
}

const typeIcons: Record<string, string> = {
  pickup: "🏪",
  delivery: "🚚",
  event: "🎉",
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status: rawStatus } = await searchParams
  const activeStatus = VALID_STATUSES.includes(rawStatus ?? "") ? (rawStatus as string) : "all"

  const orders = await getOrders()

  // Count per status (for tab badges)
  const counts: Record<string, number> = {}
  for (const o of orders) {
    counts[o.status] = (counts[o.status] ?? 0) + 1
  }

  // Filter for display
  const displayed = activeStatus === "all" ? orders : orders.filter((o) => o.status === activeStatus)

  const activeCount = orders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Заказы</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {activeCount > 0 ? `${activeCount} активных` : "Нет активных заказов"}
          </p>
        </div>
        <Link
          href="/orders/new"
          className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          Новый заказ
        </Link>
      </div>

      <OrderStatusTabs activeStatus={activeStatus} counts={counts} />

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList className="h-10 w-10 text-zinc-200 mb-3" />
            <p className="text-sm font-medium text-zinc-500">Нет заказов</p>
            {activeStatus === "all" && (
              <>
                <p className="text-xs text-zinc-400 mt-1">Создайте первый заказ</p>
                <Link
                  href="/orders/new"
                  className="mt-4 flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Новый заказ
                </Link>
              </>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">№</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">Клиент</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden md:table-cell">Тип</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden lg:table-cell">Готов к</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Сумма</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden sm:table-cell">Оплата</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Статус</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((order, i) => {
                const status = statusConfig[order.status] ?? { label: order.status, className: "bg-zinc-100 text-zinc-500" }
                const payment = paymentStatusConfig[order.payment_status ?? "unpaid"]
                const isLast = i === displayed.length - 1
                const isDimmed = order.status === "delivered" || order.status === "cancelled"

                return (
                  <tr
                    key={order.id}
                    className={`border-b border-zinc-50 hover:bg-zinc-50/80 transition-colors cursor-pointer ${isLast ? "border-0" : ""} ${isDimmed ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/orders/${order.id}`} className="block">
                        <span className="font-mono text-xs text-zinc-400">{order.order_number ?? "—"}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/orders/${order.id}`} className="block">
                        <span className="font-medium text-zinc-800">
                          {order.customers?.full_name ?? "Без имени"}
                        </span>
                        {order.customers?.phone && (
                          <p className="text-xs text-zinc-400 mt-0.5">{order.customers.phone}</p>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-base" title={order.type ?? ""}>
                        {typeIcons[order.type ?? "pickup"] ?? "📦"}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-zinc-500 text-xs">
                      {order.ready_at
                        ? new Date(order.ready_at).toLocaleString("ru", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-zinc-800 tabular-nums">
                      {order.total_amount != null
                        ? `₽ ${order.total_amount.toLocaleString("ru", { maximumFractionDigits: 0 })}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      <span className={`text-xs font-medium ${payment?.className ?? "text-zinc-400"}`}>
                        {payment?.label ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
