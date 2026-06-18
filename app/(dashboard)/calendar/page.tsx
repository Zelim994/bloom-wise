import Link from "next/link"
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/services/organizationService"
import { OrderStockBadge } from "@/components/orders/OrderStockBadge"
import {
  OrdersMonthCalendar,
  type MonthCalendarOrder,
  type CalendarCell,
} from "@/components/calendar/OrdersMonthCalendar"
import { CalendarFilterTabs } from "@/components/calendar/CalendarFilterTabs"
import { CalendarLegend } from "@/components/calendar/CalendarLegend"
import {
  VALID_CALENDAR_FILTERS,
  type CalendarFilter,
} from "@/lib/calendar/periods"

// ─── constants ───────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
]
const MONTH_GEN = [
  "января","февраля","марта","апреля","мая","июня",
  "июля","августа","сентября","октября","ноября","декабря",
]

const STATUS_LABEL: Record<string, string> = {
  new: "Новый", in_progress: "В работе", ready: "Готов", delivered: "Выдан",
}
const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Не оплачен", partial: "Частично", paid: "Оплачен",
}
const PAYMENT_CLS: Record<string, string> = {
  unpaid:  "bg-red-100 text-red-600",
  partial: "bg-amber-100 text-amber-700",
  paid:    "bg-emerald-100 text-emerald-700",
}

// ─── date helpers ─────────────────────────────────────────────────────────────

function pad2(n: number) { return String(n).padStart(2, "0") }
function toMonthStr(y: number, m: number) { return `${y}-${pad2(m)}` }

function parseMonth(raw: string | undefined): { year: number; month: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number)
    if (y >= 2020 && y <= 2050 && m >= 1 && m <= 12) return { year: y, month: m }
  }
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

function shift(year: number, month: number, delta: number) {
  let m = month + delta, y = year
  if (m > 12) { m -= 12; y++ }
  if (m < 1)  { m += 12; y-- }
  return { year: y, month: m }
}

function buildGrid(year: number, month: number): CalendarCell[] {
  const firstDow    = (new Date(year, month - 1, 1).getDay() + 6) % 7 // Mon=0
  const daysInMonth = new Date(year, month, 0).getDate()
  const prev        = shift(year, month, -1)
  const daysInPrev  = new Date(prev.year, prev.month, 0).getDate()
  const nxt         = shift(year, month, 1)

  const cells: CalendarCell[] = []

  // Leading days from previous month
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = daysInPrev - i
    cells.push({ dateStr: `${toMonthStr(prev.year, prev.month)}-${pad2(d)}`, dayNum: d, isCurrentMonth: false })
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dateStr: `${toMonthStr(year, month)}-${pad2(d)}`, dayNum: d, isCurrentMonth: true })
  }
  // Trailing days from next month (fill to 42)
  let d = 1
  while (cells.length < 42) {
    cells.push({ dateStr: `${toMonthStr(nxt.year, nxt.month)}-${pad2(d)}`, dayNum: d, isCurrentMonth: false })
    d++
  }
  return cells
}

// ─── full order row for selected-day panel ───────────────────────────────────

type FullOrder = MonthCalendarOrder & {
  total_amount: number | null
  stock_returned: boolean
  order_date: string
}

function SelectedDayPanel({
  selectedDay,
  orders,
  curMonthStr,
  filterPart,
}: {
  selectedDay: string
  orders: FullOrder[]
  curMonthStr: string
  filterPart: string
}) {
  const d = new Date(selectedDay + "T00:00:00")
  const title = `${d.getDate()} ${MONTH_GEN[d.getMonth()]}`

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-zinc-900">Заказы на {title}</h2>
        <div className="flex-1 h-px bg-zinc-100" />
        <Link
          href={`/calendar?month=${curMonthStr}${filterPart}`}
          className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
        >
          Закрыть ×
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-zinc-200 bg-white text-center">
          <CalendarDays className="h-8 w-8 text-zinc-200 mb-2" />
          <p className="text-sm text-zinc-400">На этот день заказов нет</p>
          <Link
            href={`/orders/new?order_date=${selectedDay}`}
            className="mt-3 flex items-center gap-1.5 text-sm text-rose-500 hover:text-rose-600 font-medium"
          >
            <Plus className="h-4 w-4" />
            Создать заказ
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const time = order.ready_at
              ? new Date(order.ready_at).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })
              : null
            const stLabel = STATUS_LABEL[order.status]  ?? order.status
            const payLabel = PAYMENT_LABEL[order.payment_status] ?? order.payment_status
            const payCls   = PAYMENT_CLS[order.payment_status]   ?? "bg-zinc-100 text-zinc-400"

            return (
              <div key={order.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
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
                      <span className="text-sm font-medium text-zinc-700 tabular-nums">{time}</span>
                    )}
                    <span className="text-sm font-semibold text-zinc-800 tabular-nums">
                      ₽{(order.total_amount ?? 0).toLocaleString("ru", { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                      {stLabel}
                    </span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${payCls}`}>
                      {payLabel}
                    </span>
                    <OrderStockBadge
                      stockWrittenOff={order.stock_written_off}
                      stockReturned={order.stock_returned}
                    />
                  </div>
                  <Link
                    href={`/orders/${order.id}`}
                    className="text-xs text-zinc-400 hover:text-rose-500 transition-colors shrink-0"
                  >
                    Открыть →
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── filter helpers ───────────────────────────────────────────────────────────

function applyFilter(orders: FullOrder[], filter: CalendarFilter): FullOrder[] {
  switch (filter) {
    case "new":         return orders.filter((o) => o.status === "new")
    case "in_progress": return orders.filter((o) => o.status === "in_progress")
    case "ready":       return orders.filter((o) => o.status === "ready")
    case "unpaid":      return orders.filter((o) => o.payment_status === "unpaid" || o.payment_status === "partial")
    case "stock":       return orders.filter((o) => !o.stock_written_off)
    default:            return orders
  }
}

// ─── page ────────────────────────────────────────────────────────────────────

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string; filter?: string }>
}) {
  const { month: rawMonth, day: rawDay, filter: rawFilter } = await searchParams
  const activeFilter: CalendarFilter = VALID_CALENDAR_FILTERS.includes(rawFilter as CalendarFilter)
    ? (rawFilter as CalendarFilter)
    : "all"
  const { year, month } = parseMonth(rawMonth)
  const curMonthStr = toMonthStr(year, month)

  const today        = new Date()
  const todayStr     = today.toISOString().split("T")[0]
  const curTodayMonth = toMonthStr(today.getFullYear(), today.getMonth() + 1)
  const isThisMonth  = curMonthStr === curTodayMonth

  // Fetch orders for the displayed month
  const supabase = await createClient()
  const orgId    = await getOrgId(supabase)

  let orders: FullOrder[] = []

  if (orgId) {
    const firstDay = `${curMonthStr}-01`
    const lastDayNum = new Date(year, month, 0).getDate()
    const lastDay  = `${curMonthStr}-${pad2(lastDayNum)}`

    const { data } = await supabase
      .from("orders")
      .select(
        "id, order_number, status, payment_status, total_amount, stock_written_off, stock_returned, ready_at, order_date, customers(full_name)"
      )
      .eq("organization_id", orgId)
      .neq("status", "cancelled")
      .gte("order_date", firstDay)
      .lte("order_date", lastDay)
      .order("ready_at", { ascending: true, nullsFirst: false })
      .order("order_date", { ascending: true })

    orders = (data ?? []) as unknown as FullOrder[]
  }

  // Apply client-side filter
  const filteredOrders = applyFilter(orders, activeFilter)

  // Group by order_date
  const byDate: Record<string, FullOrder[]> = {}
  for (const o of filteredOrders) {
    if (!byDate[o.order_date]) byDate[o.order_date] = []
    byDate[o.order_date].push(o)
  }

  // Selected day
  const selectedDay    = rawDay && /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : null
  const selectedOrders = selectedDay ? (byDate[selectedDay] ?? []) : []

  // Navigation
  const prev = shift(year, month, -1)
  const nxt  = shift(year, month, 1)
  const cells = buildGrid(year, month)
  const filterPart = activeFilter !== "all" ? `&filter=${activeFilter}` : ""

  // ordersByDate for the calendar grid (MonthCalendarOrder shape — subset of FullOrder)
  const ordersByDate: Record<string, MonthCalendarOrder[]> = byDate

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-zinc-900">Календарь заказов</h1>
        <Link
          href={selectedDay ? `/orders/new?order_date=${selectedDay}` : "/orders/new"}
          className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          Новый заказ
        </Link>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-1">
        <Link
          href={`/calendar?month=${toMonthStr(prev.year, prev.month)}${filterPart}`}
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <span className="text-base font-semibold text-zinc-800 min-w-[160px] text-center px-1">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <Link
          href={`/calendar?month=${toMonthStr(nxt.year, nxt.month)}${filterPart}`}
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          aria-label="Следующий месяц"
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
        {!isThisMonth && (
          <Link
            href={`/calendar${filterPart ? `?${filterPart.slice(1)}` : ""}`}
            className="ml-2 px-3 py-1.5 rounded-lg text-sm text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors"
          >
            Сегодня
          </Link>
        )}
        {filteredOrders.length > 0 && (
          <span className="ml-auto text-sm text-zinc-400">
            {filteredOrders.length}{" "}
            {filteredOrders.length === 1 ? "заказ" : filteredOrders.length <= 4 ? "заказа" : "заказов"}
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <CalendarFilterTabs
        activeFilter={activeFilter}
        curMonthStr={curMonthStr}
        selectedDay={selectedDay}
      />

      {/* Legend */}
      <CalendarLegend />

      {/* Calendar grid (horizontal scroll on small screens) */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="min-w-[600px]">
          <OrdersMonthCalendar
            cells={cells}
            ordersByDate={ordersByDate}
            todayStr={todayStr}
            selectedDay={selectedDay}
            curMonthStr={curMonthStr}
            activeFilter={activeFilter}
          />
        </div>
      </div>

      {/* Selected day details */}
      {selectedDay && (
        <SelectedDayPanel
          selectedDay={selectedDay}
          orders={selectedOrders}
          curMonthStr={curMonthStr}
          filterPart={filterPart}
        />
      )}
    </div>
  )
}
