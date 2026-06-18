import Link from "next/link"
import { CalendarDays, Plus, ArrowRight } from "lucide-react"
import { getOrdersForCalendar, type CalendarOrder } from "@/app/actions/calendar"
import {
  CalendarPeriodTabs,
  VALID_CALENDAR_PERIODS,
  type CalendarPeriod,
} from "@/components/calendar/CalendarPeriodTabs"
import { OrderStockBadge } from "@/components/orders/OrderStockBadge"

// ─── helpers ────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  new:         { label: "Новый",    cls: "bg-blue-100 text-blue-700"       },
  in_progress: { label: "В работе", cls: "bg-amber-100 text-amber-700"     },
  ready:       { label: "Готов",    cls: "bg-emerald-100 text-emerald-700"  },
  delivered:   { label: "Выдан",    cls: "bg-zinc-100 text-zinc-500"        },
}

const PAYMENT_CFG: Record<string, { label: string; cls: string }> = {
  unpaid:  { label: "Не оплачен", cls: "bg-red-100 text-red-600"          },
  partial: { label: "Частично",   cls: "bg-amber-100 text-amber-700"      },
  paid:    { label: "Оплачен",    cls: "bg-emerald-100 text-emerald-700"  },
}

const TYPE_ICON: Record<string, string> = {
  pickup:   "🏪",
  delivery: "🚚",
  event:    "🎉",
}

const EMPTY_LABEL: Record<CalendarPeriod, string> = {
  today:    "На сегодня заказов нет",
  tomorrow: "На завтра заказов нет",
  "7d":     "На ближайшие 7 дней заказов нет",
  month:    "На этот месяц заказов нет",
}

function pad(d: Date) { return d.toISOString().split("T")[0] }

function filterByPeriod(
  orders: CalendarOrder[],
  period: CalendarPeriod,
  todayStr: string,
  tomorrowStr: string,
  sevenStr: string,
  monthStr: string,
): CalendarOrder[] {
  if (period === "today")    return orders.filter((o) => o.order_date === todayStr)
  if (period === "tomorrow") return orders.filter((o) => o.order_date === tomorrowStr)
  if (period === "7d")       return orders.filter((o) => o.order_date >= todayStr && o.order_date < sevenStr)
  // month
  return orders.filter((o) => o.order_date >= todayStr && o.order_date <= monthStr)
}

function formatDayLabel(dateStr: string, todayStr: string, tomorrowStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  const full = d.toLocaleDateString("ru", { day: "numeric", month: "long" })
  if (dateStr === todayStr)    return `Сегодня, ${full}`
  if (dateStr === tomorrowStr) return `Завтра, ${full}`
  return d.toLocaleDateString("ru", { weekday: "long", day: "numeric", month: "long" })
}

function isPast(dateStr: string, todayStr: string) { return dateStr < todayStr }
function isToday(dateStr: string, todayStr: string) { return dateStr === todayStr }

function plural(n: number) {
  if (n === 1) return "заказ"
  if (n >= 2 && n <= 4) return "заказа"
  return "заказов"
}

// ─── page ───────────────────────────────────────────────────────────────────

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: rawPeriod } = await searchParams
  const period: CalendarPeriod = VALID_CALENDAR_PERIODS.includes(rawPeriod as CalendarPeriod)
    ? (rawPeriod as CalendarPeriod)
    : "today"

  const allOrders = await getOrdersForCalendar()

  const today    = new Date()
  const todayStr    = pad(today)
  const tomorrowStr = pad(new Date(today.getTime() + 86_400_000))
  const sevenStr    = pad(new Date(today.getTime() + 7 * 86_400_000))
  const monthStr    = pad(new Date(today.getTime() + 30 * 86_400_000))

  const orders = filterByPeriod(allOrders, period, todayStr, tomorrowStr, sevenStr, monthStr)

  // Group by order_date, sort within each group: ready_at first (asc), then nulls
  const grouped = new Map<string, CalendarOrder[]>()
  for (const o of orders) {
    const date = o.order_date
    if (!grouped.has(date)) grouped.set(date, [])
    grouped.get(date)!.push(o)
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => {
      if (a.ready_at && b.ready_at) return a.ready_at.localeCompare(b.ready_at)
      if (a.ready_at) return -1
      if (b.ready_at) return 1
      return 0
    })
  }
  const sortedDates = [...grouped.keys()].sort()

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Календарь заказов</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Заказы по дате планирования</p>
        </div>
        <div className="flex items-center gap-3">
          <CalendarPeriodTabs active={period} />
          <Link
            href="/orders/new"
            className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            Новый заказ
          </Link>
        </div>
      </div>

      {/* Content */}
      {sortedDates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-xl border border-zinc-200 bg-white text-center">
          <CalendarDays className="h-10 w-10 text-zinc-200 mb-3" />
          <p className="text-sm font-medium text-zinc-500">{EMPTY_LABEL[period]}</p>
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
            const past  = isPast(date, todayStr)
            const today = isToday(date, todayStr)

            return (
              <div key={date}>
                {/* Day header */}
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className={`text-sm font-semibold ${
                      today ? "text-rose-600" : past ? "text-zinc-400" : "text-zinc-700"
                    }`}
                  >
                    {formatDayLabel(date, todayStr, tomorrowStr)}
                  </span>
                  <div className="flex-1 h-px bg-zinc-100" />
                  <span className="text-xs text-zinc-400">
                    {dayOrders.length} {plural(dayOrders.length)}
                  </span>
                </div>

                {/* Order cards */}
                <div className="space-y-2">
                  {dayOrders.map((order) => {
                    const sc  = STATUS_CFG[order.status]  ?? { label: order.status, cls: "bg-zinc-100 text-zinc-500" }
                    const pay = PAYMENT_CFG[order.payment_status] ?? { label: order.payment_status, cls: "bg-zinc-100 text-zinc-400" }
                    const icon = TYPE_ICON[order.type ?? "pickup"] ?? "📦"
                    const time = order.ready_at
                      ? new Date(order.ready_at).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })
                      : null
                    const isOverdue = past && order.status !== "ready" && order.status !== "delivered"

                    return (
                      <div
                        key={order.id}
                        className={`rounded-xl border bg-white transition-all ${
                          isOverdue
                            ? "border-red-100 bg-red-50/30"
                            : today
                            ? "border-rose-200"
                            : "border-zinc-200"
                        }`}
                      >
                        <div className="flex items-start gap-3 px-4 py-3">
                          {/* Icon + main info */}
                          <span className="text-base shrink-0 mt-0.5">{icon}</span>
                          <div className="flex-1 min-w-0">
                            {/* Top row: order number + customer + time */}
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono text-sm font-semibold text-zinc-800 shrink-0">
                                  {order.order_number ?? "—"}
                                </span>
                                <span className="text-sm text-zinc-500 truncate">
                                  {order.customers?.full_name ?? "Без имени"}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                {time && (
                                  <span className="text-sm font-medium text-zinc-700 tabular-nums">
                                    {time}
                                  </span>
                                )}
                                <span className="text-sm font-semibold text-zinc-800 tabular-nums">
                                  ₽{(order.total_amount ?? 0).toLocaleString("ru", { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                            </div>
                            {/* Bottom row: badges + open link */}
                            <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${sc.cls}`}>
                                  {sc.label}
                                </span>
                                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${pay.cls}`}>
                                  {pay.label}
                                </span>
                                <OrderStockBadge
                                  stockWrittenOff={order.stock_written_off}
                                  stockReturned={order.stock_returned}
                                />
                              </div>
                              <Link
                                href={`/orders/${order.id}`}
                                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-rose-500 transition-colors shrink-0"
                              >
                                Открыть <ArrowRight className="h-3 w-3" />
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
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
