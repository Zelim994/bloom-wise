import Link from "next/link"
import { CalendarDays, Plus } from "lucide-react"
import { getOrdersForCalendar, type CalendarOrder } from "@/app/actions/calendar"

const statusConfig: Record<string, { label: string; dot: string }> = {
  new: { label: "Новый", dot: "bg-blue-400" },
  in_progress: { label: "В работе", dot: "bg-amber-400" },
  ready: { label: "Готов", dot: "bg-emerald-400" },
  delivered: { label: "Выдан", dot: "bg-zinc-300" },
}

const typeIcon: Record<string, string> = {
  pickup: "🏪",
  delivery: "🚚",
  event: "🎉",
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (d.getTime() === today.getTime()) return "Сегодня"
  if (d.getTime() === tomorrow.getTime()) return "Завтра"
  if (d.getTime() === yesterday.getTime()) return "Вчера"

  return d.toLocaleDateString("ru", { weekday: "long", day: "numeric", month: "long" })
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00")
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d.getTime() === today.getTime()
}

function isPast(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00")
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}

function getDisplayDate(order: CalendarOrder): string {
  if (order.ready_at) return order.ready_at.slice(0, 10)
  return order.order_date.slice(0, 10)
}

export default async function CalendarPage() {
  const orders = await getOrdersForCalendar()

  // Group by display date
  const grouped = new Map<string, CalendarOrder[]>()
  for (const order of orders) {
    const date = getDisplayDate(order)
    if (!grouped.has(date)) grouped.set(date, [])
    grouped.get(date)!.push(order)
  }

  const sortedDates = [...grouped.keys()].sort()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Календарь заказов</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Заказы по дате готовности</p>
        </div>
        <Link
          href="/orders/new"
          className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          Новый заказ
        </Link>
      </div>

      {sortedDates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-xl border border-zinc-200 bg-white text-center">
          <CalendarDays className="h-10 w-10 text-zinc-200 mb-3" />
          <p className="text-sm font-medium text-zinc-500">Заказов нет</p>
          <p className="text-xs text-zinc-400 mt-1">Предстоящие заказы появятся здесь</p>
          <Link
            href="/orders/new"
            className="mt-5 flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            Создать заказ
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((date) => {
            const dayOrders = grouped.get(date)!
            const past = isPast(date)
            const today = isToday(date)

            return (
              <div key={date}>
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`text-sm font-semibold ${
                      today
                        ? "text-rose-600"
                        : past
                        ? "text-zinc-400"
                        : "text-zinc-700"
                    }`}
                  >
                    {formatDateLabel(date)}
                  </div>
                  <div className="flex-1 h-px bg-zinc-100" />
                  <span className="text-xs text-zinc-400">
                    {dayOrders.length}{" "}
                    {dayOrders.length === 1
                      ? "заказ"
                      : dayOrders.length >= 2 && dayOrders.length <= 4
                      ? "заказа"
                      : "заказов"}
                  </span>
                </div>

                <div className="space-y-2">
                  {dayOrders.map((order) => {
                    const sc = statusConfig[order.status] ?? {
                      label: order.status,
                      dot: "bg-zinc-300",
                    }
                    const icon = typeIcon[order.type ?? "pickup"] ?? "📦"
                    const time = order.ready_at
                      ? new Date(order.ready_at).toLocaleTimeString("ru", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : null

                    return (
                      <Link
                        key={order.id}
                        href={`/orders/${order.id}`}
                        className={`flex items-center gap-4 rounded-xl border bg-white px-4 py-3 hover:border-rose-200 hover:shadow-sm transition-all ${
                          past && order.status !== "ready" && order.status !== "delivered"
                            ? "border-red-100 bg-red-50/30"
                            : today
                            ? "border-rose-200"
                            : "border-zinc-200"
                        }`}
                      >
                        <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${sc.dot}`} />
                        <span className="text-sm shrink-0">{icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-800 tabular-nums">
                              {order.order_number ?? "—"}
                            </span>
                            <span className="text-sm text-zinc-500 truncate">
                              {order.customers?.full_name ?? "Без имени"}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400 mt-0.5">{sc.label}</p>
                        </div>
                        <div className="text-right shrink-0">
                          {time && (
                            <p className="text-xs font-medium text-zinc-700">{time}</p>
                          )}
                          <p className="text-sm font-semibold text-zinc-800 tabular-nums">
                            ₽{(order.total_amount ?? 0).toLocaleString("ru", {
                              maximumFractionDigits: 0,
                            })}
                          </p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
