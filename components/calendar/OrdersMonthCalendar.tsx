import Link from "next/link"

export type MonthCalendarOrder = {
  id: string
  order_number: string | null
  status: string
  payment_status: string
  stock_written_off: boolean
  ready_at: string | null
  customers: { full_name: string | null } | null
}

export type CalendarCell = {
  dateStr: string
  dayNum: number
  isCurrentMonth: boolean
}

const STATUS_DOT: Record<string, string> = {
  new:         "bg-blue-400",
  in_progress: "bg-amber-400",
  ready:       "bg-emerald-400",
  delivered:   "bg-zinc-300",
}

const STATUS_CHIP: Record<string, string> = {
  new:         "bg-blue-50 text-blue-800",
  in_progress: "bg-amber-50 text-amber-900",
  ready:       "bg-emerald-50 text-emerald-900",
  delivered:   "bg-zinc-100 text-zinc-500",
}

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

interface Props {
  cells: CalendarCell[]
  ordersByDate: Record<string, MonthCalendarOrder[]>
  todayStr: string
  selectedDay: string | null
  curMonthStr: string
  activeFilter: string
}

export function OrdersMonthCalendar({
  cells,
  ordersByDate,
  todayStr,
  selectedDay,
  curMonthStr,
  activeFilter,
}: Props) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-zinc-100">
        {DAY_NAMES.map((name, i) => (
          <div
            key={name}
            className={`py-2.5 text-center text-xs font-semibold uppercase tracking-wide ${
              i >= 5 ? "text-zinc-300" : "text-zinc-400"
            }`}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map(({ dateStr, dayNum, isCurrentMonth }, idx) => {
          const cellOrders = ordersByDate[dateStr] ?? []
          const isToday    = dateStr === todayStr
          const isSelected = dateStr === selectedDay
          const isWeekend  = idx % 7 >= 5
          const isLastRow  = idx >= 35
          const isLastCol  = (idx + 1) % 7 === 0

          const filterPart = activeFilter !== "all" ? `&filter=${activeFilter}` : ""
          const dayHref = isSelected
            ? `/calendar?month=${curMonthStr}${filterPart}`
            : `/calendar?month=${curMonthStr}&day=${dateStr}${filterPart}`

          return (
            <div
              key={dateStr}
              className={[
                "min-h-[110px] flex flex-col",
                isLastRow ? "" : "border-b border-zinc-100",
                isLastCol ? "" : "border-r border-zinc-100",
                isSelected
                  ? "bg-rose-50"
                  : isToday
                  ? "bg-blue-50/40"
                  : isCurrentMonth
                  ? isWeekend
                    ? "bg-zinc-50/40"
                    : "bg-white"
                  : "bg-zinc-50/70",
              ].join(" ")}
            >
              {/* Day-selection link (just the header row — no nesting with chips below) */}
              <Link
                href={dayHref}
                className="flex items-center justify-between px-1.5 pt-1.5 pb-0.5 hover:bg-black/[0.03] transition-colors"
              >
                <span
                  className={[
                    "text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full",
                    isToday
                      ? "bg-rose-500 text-white"
                      : isSelected
                      ? "bg-zinc-900 text-white"
                      : isCurrentMonth
                      ? isWeekend
                        ? "text-zinc-400"
                        : "text-zinc-700"
                      : "text-zinc-300",
                  ].join(" ")}
                >
                  {dayNum}
                </span>
                {cellOrders.length > 0 && (
                  <span
                    className={`text-[10px] font-medium mr-0.5 ${
                      isToday ? "text-rose-400" : "text-zinc-400"
                    }`}
                  >
                    {cellOrders.length}
                  </span>
                )}
              </Link>

              {/* Order chips — separate links, NOT nested inside the day link */}
              <div className="px-1 pb-1.5 pt-0.5 space-y-0.5 flex-1">
                {cellOrders.slice(0, 3).map((order) => {
                  const time = order.ready_at
                    ? new Date(order.ready_at).toLocaleTimeString("ru", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : null
                  const chipCls = STATUS_CHIP[order.status] ?? "bg-zinc-100 text-zinc-600"
                  const dotCls  = STATUS_DOT[order.status]  ?? "bg-zinc-300"

                  return (
                    <Link
                      key={order.id}
                      href={`/orders/${order.id}`}
                      className={`flex items-start gap-1 px-1 py-0.5 rounded text-[10px] leading-tight hover:opacity-75 transition-opacity ${chipCls}`}
                    >
                      <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotCls}`} />
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="flex items-center gap-0.5">
                          {time && (
                            <span className="font-medium tabular-nums shrink-0">{time}</span>
                          )}
                          <span className="font-mono truncate">{order.order_number ?? "—"}</span>
                        </div>
                        {order.customers?.full_name && (
                          <div className="truncate text-[9px] opacity-60 leading-snug">
                            {order.customers.full_name}
                          </div>
                        )}
                        {(order.payment_status !== "paid" || !order.stock_written_off) && (
                          <div className="flex gap-0.5 mt-0.5">
                            {order.payment_status !== "paid" && (
                              <span className="px-0.5 rounded bg-red-100 text-red-500 text-[8px] leading-tight">
                                ₽
                              </span>
                            )}
                            {!order.stock_written_off && (
                              <span className="px-0.5 rounded bg-orange-100 text-orange-500 text-[8px] leading-tight">
                                Склад
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </Link>
                  )
                })}

                {cellOrders.length > 3 && (
                  <p className="text-[10px] text-zinc-400 pl-1">
                    + ещё {cellOrders.length - 3}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
