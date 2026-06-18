import Link from "next/link"
import {
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Scissors,
  Package,
  AlertTriangle,
  Clock,
  Minus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatsCard, type StatItem } from "@/components/dashboard/StatsCard"
import { UpcomingOrdersWidget, type UpcomingOrder } from "@/components/dashboard/UpcomingOrdersWidget"
import { StockAlertsWidget, type StockAlert } from "@/components/dashboard/StockAlertsWidget"
import { OrdersAttentionWidget } from "@/components/dashboard/OrdersAttentionWidget"
import { DashboardPeriodTabs } from "@/components/dashboard/DashboardPeriodTabs"
import {
  getPeriodDateRange,
  PERIOD_LABEL,
  VALID_PERIODS,
  type Period,
} from "@/lib/dashboard/periods"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/services/organizationService"


export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const { period: rawPeriod, from: rawFrom, to: rawTo } = await searchParams
  const period: Period = VALID_PERIODS.includes(rawPeriod as Period)
    ? (rawPeriod as Period)
    : "today"

  const supabase = await createClient()
  const orgId = await getOrgId(supabase)

  let upcomingOrders: UpcomingOrder[] = []
  let stockAlerts: StockAlert[] = []
  let stats: StatItem[] = []

  if (orgId) {
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]
    const tomorrowStr = new Date(today.getTime() + 86_400_000).toISOString().split("T")[0]
    const dayAfterStr  = new Date(today.getTime() + 2 * 86_400_000).toISOString().split("T")[0]
    const sevenDayStr  = new Date(today.getTime() + 7 * 86_400_000).toISOString().split("T")[0]
    const tenDaysAgo = new Date(today.getTime() - 10 * 86_400_000).toISOString()
    const dateRange = getPeriodDateRange(period, today, rawFrom, rawTo)

    // KPI-запросы по периоду
    let periodOrdersQuery = supabase
      .from("orders")
      .select("total_amount, profit")
      .eq("organization_id", orgId)
      .neq("status", "cancelled")
    if (dateRange.from) periodOrdersQuery = periodOrdersQuery.gte("order_date", dateRange.from)
    if (dateRange.to)   periodOrdersQuery = periodOrdersQuery.lt("order_date", dateRange.to)

    let writeoffsQuery = supabase
      .from("writeoffs")
      .select("loss_amount")
      .eq("organization_id", orgId)
    if (dateRange.from) writeoffsQuery = writeoffsQuery.gte("writeoff_date", dateRange.from)
    if (dateRange.to)   writeoffsQuery = writeoffsQuery.lt("writeoff_date", dateRange.to)

    const [
      upcomingRes, periodOrdersRes, flowersRes, stockRes,
      agingRes, writeoffsRes, tomorrowRes,
    ] = await Promise.all([
      // Ближайшие заказы (7 дней) для виджета
      supabase
        .from("orders")
        .select("id, order_number, status, payment_status, stock_written_off, stock_returned, order_date, ready_at, customers(full_name)")
        .eq("organization_id", orgId)
        .neq("status", "cancelled")
        .gte("order_date", todayStr)
        .lt("order_date", sevenDayStr)
        .order("order_date", { ascending: true })
        .limit(30),
      // KPI по выбранному периоду
      periodOrdersQuery,
      supabase.from("flowers").select("id, name, min_stock").eq("organization_id", orgId).eq("is_active", true),
      supabase.from("flower_stock").select("flower_id, current_stock"),
      supabase.from("inventory_items").select("flower_id, quantity_remaining, arrived_at")
        .eq("organization_id", orgId).gt("quantity_remaining", 0).lt("arrived_at", tenDaysAgo),
      // Списания по выбранному периоду
      writeoffsQuery,
      supabase.from("orders").select("id, type")
        .eq("organization_id", orgId)
        .gte("order_date", tomorrowStr).lt("order_date", dayAfterStr)
        .not("status", "in", "(cancelled,delivered)"),
    ])

    // Виджет "Ближайшие заказы"
    upcomingOrders = (upcomingRes.data ?? []).map((o) => {
      const row = o as {
        id: string; order_number: string; status: string; payment_status: string
        stock_written_off: boolean; stock_returned: boolean
        order_date: string; ready_at: string | null
        customers: { full_name: string } | null
      }
      return {
        id: row.id,
        order_number: row.order_number,
        status: row.status,
        payment_status: row.payment_status,
        stock_written_off: row.stock_written_off,
        stock_returned: row.stock_returned,
        order_date: row.order_date,
        ready_at: row.ready_at,
        customer_name: row.customers?.full_name ?? null,
      }
    })

    // Склад — внимание
    const stockMap = new Map(
      (stockRes.data ?? []).map((s) => [s.flower_id, Number(s.current_stock ?? 0)])
    )
    const flowers = flowersRes.data ?? []

    const agingMap = new Map<string, number>()
    for (const item of agingRes.data ?? []) {
      const days = Math.floor((today.getTime() - new Date(item.arrived_at).getTime()) / 86_400_000)
      const prev = agingMap.get(item.flower_id)
      if (prev === undefined || days > prev) agingMap.set(item.flower_id, days)
    }

    const outAlerts: StockAlert[] = []
    const lowAlerts: StockAlert[] = []
    const agingAlerts: StockAlert[] = []

    for (const f of flowers) {
      const stock = stockMap.get(f.id) ?? 0
      const min = f.min_stock ?? 0
      if (min > 0 && stock === 0) {
        outAlerts.push({ name: f.name, stock, min, type: "out" })
      } else if (min > 0 && stock <= min) {
        lowAlerts.push({ name: f.name, stock, min, type: "low" })
      }
      if (agingMap.has(f.id)) {
        agingAlerts.push({ name: f.name, stock, min, type: "aging", days: agingMap.get(f.id) })
      }
    }

    stockAlerts = [...outAlerts, ...lowAlerts, ...agingAlerts].slice(0, 6)

    // KPI карточки
    type KpiRow = { total_amount: number | null; profit: number | null }
    const kpiOrders = (periodOrdersRes.data ?? []) as KpiRow[]
    const kpiRevenue  = kpiOrders.reduce((s, o) => s + (o.total_amount ?? 0), 0)
    const kpiProfit   = kpiOrders.reduce((s, o) => s + (o.profit ?? 0), 0)
    const kpiCount    = kpiOrders.length
    const writeoffTotal = (writeoffsRes.data ?? []).reduce((s, w) => s + (w.loss_amount ?? 0), 0)

    const tomorrowOrders    = tomorrowRes.data ?? []
    const tomorrowDeliveries = tomorrowOrders.filter((o) => (o as { type: string }).type === "delivery").length
    const totalStock    = [...stockMap.values()].reduce((s, v) => s + v, 0)
    const stockWithItems = [...stockMap.values()].filter((v) => v > 0).length
    const lowStockCount  = outAlerts.length + lowAlerts.length
    const agingCount     = agingAlerts.length

    const fmt = (n: number) =>
      n > 0 ? `₽ ${n.toLocaleString("ru", { maximumFractionDigits: 0 })}` : "₽ 0"
    const pl = PERIOD_LABEL[period]
    const noOrders = `Нет заказов ${pl}`

    stats = [
      {
        label: "Выручка",
        value: fmt(kpiRevenue),
        trend: kpiCount > 0 ? `${kpiCount} заказов` : noOrders,
        up: kpiRevenue > 0,
        icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-50",
      },
      {
        label: "Прибыль",
        value: fmt(kpiProfit),
        trend: kpiProfit > 0 ? pl : `Нет данных ${pl}`,
        up: kpiProfit > 0,
        icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-50",
      },
      {
        label: "Заказы",
        value: kpiCount > 0 ? String(kpiCount) : "0",
        trend: kpiCount > 0 ? pl : noOrders,
        up: kpiCount > 0,
        icon: ShoppingBag, color: "text-blue-500", bg: "bg-blue-50",
      },
      {
        label: "Списания",
        value: writeoffTotal > 0 ? fmt(writeoffTotal) : "—",
        trend: writeoffTotal > 0 ? pl : `Нет списаний ${pl}`,
        up: writeoffTotal === 0,
        icon: Minus, color: "text-rose-500", bg: "bg-rose-50",
      },
      {
        label: "Заказы на завтра",
        value: String(tomorrowOrders.length),
        trend: tomorrowDeliveries > 0 ? `${tomorrowDeliveries} доставок` : "Нет доставок",
        up: tomorrowOrders.length > 0,
        icon: Clock, color: "text-violet-500", bg: "bg-violet-50",
      },
      {
        label: "Остаток склада",
        value: `${totalStock} шт`,
        trend: stockWithItems > 0 ? `${stockWithItems} позиций` : "Склад пуст",
        up: totalStock > 0,
        icon: Package, color: "text-amber-500", bg: "bg-amber-50",
      },
      {
        label: "Низкий остаток",
        value: lowStockCount > 0 ? `${lowStockCount} товаров` : "Всё в норме",
        trend: lowStockCount > 0 ? "Требуют закупки" : "Запасов достаточно",
        up: lowStockCount === 0,
        icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-50",
      },
      {
        label: "Залежались",
        value: agingCount > 0 ? `${agingCount} позиций` : "Всё свежее",
        trend: agingCount > 0 ? "Старше 10 дней" : "Всё в порядке",
        up: agingCount === 0,
        icon: TrendingDown, color: "text-red-500", bg: "bg-red-50",
      },
    ]
  }

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">

      {/* Основная зона */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Приветствие + быстрые действия */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-zinc-900">Добро пожаловать 🌸</h2>
            <p className="text-sm text-zinc-500 mt-0.5">Сегодня на связи</p>
          </div>
          <div className="flex gap-3">
            <Button asChild className="bg-rose-500 hover:bg-rose-600 text-white gap-2">
              <Link href="/orders/new">
                <ShoppingBag className="h-4 w-4" />
                Новый заказ
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2 border-zinc-200">
              <Link href="/builder">
                <Scissors className="h-4 w-4" />
                Собрать букет
              </Link>
            </Button>
          </div>
        </div>

        {/* Переключатель периода + карточки KPI */}
        <div className="space-y-3">
          <DashboardPeriodTabs
            activePeriod={period}
            activeFrom={rawFrom}
            activeTo={rawTo}
          />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <StatsCard key={stat.label} {...stat} />
            ))}
          </div>
        </div>

        {/* Заказы + Склад */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <UpcomingOrdersWidget orders={upcomingOrders} />
          </div>
          <div>
            <StockAlertsWidget alerts={stockAlerts} />
          </div>
        </div>
      </div>

      {/* Правая панель — Напоминания */}
      <div className="w-full xl:w-64 shrink-0 xl:sticky xl:top-6">
        <OrdersAttentionWidget />
      </div>

    </div>
  )
}
