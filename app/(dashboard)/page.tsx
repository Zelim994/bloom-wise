import Link from "next/link"
import {
  TrendingUp,
  ShoppingBag,
  Flower,
  Package,
  Minus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatsCard, type StatItem } from "@/components/dashboard/StatsCard"
import { UpcomingOrdersWidget, type UpcomingOrder } from "@/components/dashboard/UpcomingOrdersWidget"
import { DashboardRemindersPanel } from "@/components/dashboard/DashboardRemindersPanel"
import { DashboardPeriodTabs } from "@/components/dashboard/DashboardPeriodTabs"
import { GettingStarted } from "@/components/dashboard/GettingStarted"
import {
  getPeriodDateRange,
  PERIOD_LABEL,
  VALID_PERIODS,
  type Period,
} from "@/lib/dashboard/periods"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/services/organizationService"
import { getInventoryRows } from "@/lib/inventory/rows"
import { DEFAULT_LOW_THRESHOLD, type StockAlert } from "@/lib/inventory/status"
import { ALL_ROLE_LABELS } from "@/lib/team/roles"


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

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle()
    : { data: null }

  const fullName = profile?.full_name?.trim()
  const firstName = fullName?.split(/\s+/)[0]

  const displayName = firstName || user?.email || "Пользователь"
  const roleLabel =
    profile?.role && profile.role in ALL_ROLE_LABELS
      ? ALL_ROLE_LABELS[profile.role]
      : "Пользователь"

  let upcomingOrders: UpcomingOrder[] = []
  let stockAlerts: StockAlert[] = []
  let stats: StatItem[] = []

  // Флаги первого запуска для блока "С чего начать"
  let hasFlower = false
  let hasStock = false
  let hasCustomer = false
  let hasOrder = false

  if (orgId) {
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]
    const sevenDayStr  = new Date(today.getTime() + 7 * 86_400_000).toISOString().split("T")[0]
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
      upcomingRes, periodOrdersRes, inventoryRowsRes,
      writeoffsRes,
      customerCountRes, orderCountRes,
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
      // Склад: тот же источник статусов (per-variant), что использует /inventory
      getInventoryRows(supabase),
      // Списания по выбранному периоду
      writeoffsQuery,
      // Онбординг: есть ли хотя бы 1 клиент / заказ (только count, без данных)
      supabase.from("customers").select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
      supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
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

    // Склад — внимание: тот же per-variant статус, что использует /inventory
    // (getInventoryRows → getInventoryStatus), чтобы dashboard не расходился со складом
    const { rows: inventoryRows, activeFlowerIds } = inventoryRowsRes

    const outAlerts: StockAlert[] = []
    const lowAlerts: StockAlert[] = []
    const agingAlerts: StockAlert[] = []

    const stockByFlower = new Map<string, number>()
    for (const row of inventoryRows) {
      stockByFlower.set(row.flower_id, (stockByFlower.get(row.flower_id) ?? 0) + row.current_stock)
    }

    for (const row of inventoryRows) {
      if (row.status === "ok") continue

      const variant = [row.variety_name, row.variety_size].filter(Boolean).join(" ")
      const label = [row.name, variant, row.color_name].filter((p) => p && p.length > 0).join(" · ")

      if (row.status === "aging") {
        // Залежавшийся остаток показываем всегда — даже если цветок архивный,
        // старый остаток всё ещё физически лежит на складе и его надо продать/списать
        agingAlerts.push({
          name: label,
          stock: row.current_stock,
          min: 0,
          type: "aging",
          days: row.days_on_shelf ?? 0,
        })
        continue
      }

      // low / no_stock — предлагаем докупить только активные цветы,
      // архивный цветок не нужно напоминать пополнять
      if (!activeFlowerIds.has(row.flower_id)) continue

      if (row.status === "no_stock") {
        outAlerts.push({ name: label, stock: row.current_stock, min: row.min_stock ?? DEFAULT_LOW_THRESHOLD, type: "out" })
      } else if (row.status === "low") {
        lowAlerts.push({ name: label, stock: row.current_stock, min: row.min_stock ?? DEFAULT_LOW_THRESHOLD, type: "low" })
      }
    }

    stockAlerts = [...outAlerts, ...lowAlerts, ...agingAlerts]

    // KPI карточки
    type KpiRow = { total_amount: number | null; profit: number | null }
    const kpiOrders = (periodOrdersRes.data ?? []) as KpiRow[]
    const kpiRevenue  = kpiOrders.reduce((s, o) => s + (o.total_amount ?? 0), 0)
    const kpiProfit   = kpiOrders.reduce((s, o) => s + (o.profit ?? 0), 0)
    const kpiCount    = kpiOrders.length
    const writeoffTotal = (writeoffsRes.data ?? []).reduce((s, w) => s + (w.loss_amount ?? 0), 0)

    const totalStock    = [...stockByFlower.values()].reduce((s, v) => s + v, 0)
    const stockWithItems = [...stockByFlower.values()].filter((v) => v > 0).length

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
        label: "Списания",
        value: writeoffTotal > 0 ? fmt(writeoffTotal) : "—",
        trend: writeoffTotal > 0 ? pl : `Нет списаний ${pl}`,
        up: writeoffTotal === 0,
        icon: Minus, color: "text-rose-500", bg: "bg-rose-50",
      },
      {
        label: "Остаток склада",
        value: `${totalStock} шт`,
        trend: stockWithItems > 0 ? `${stockWithItems} позиций` : "Склад пуст",
        up: totalStock > 0,
        icon: Package, color: "text-amber-500", bg: "bg-amber-50",
      },
    ]

    // Онбординг: done-флаги из уже загруженных данных + count-запросов
    hasFlower = activeFlowerIds.size > 0
    hasStock = stockWithItems > 0
    hasCustomer = (customerCountRes.count ?? 0) > 0
    hasOrder = (orderCountRes.count ?? 0) > 0
  }

  // Пустой склад: цветов ещё нет и остатков ещё нет (используется, чтобы не показывать ложное "Всё в порядке")
  const isInventoryNotStarted = !hasFlower && !hasStock

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">

      {/* Основная зона */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Приветствие + быстрые действия */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-zinc-900">Добро пожаловать, {displayName} 🌸</h2>
            <p className="text-sm text-zinc-500 mt-0.5">{roleLabel}</p>
          </div>
          <div className="flex gap-3">
            <Button asChild variant="outline" className="gap-2 border-zinc-200 text-zinc-700 hover:bg-zinc-50">
              <Link href="/builder">
                <Flower className="h-4 w-4" />
                Собрать букет
              </Link>
            </Button>
            <Button asChild className="bg-rose-500 hover:bg-rose-600 text-white gap-2">
              <Link href="/orders/new">
                <ShoppingBag className="h-4 w-4" />
                Новый заказ
              </Link>
            </Button>
          </div>
        </div>

        {/* Первый запуск: с чего начать (скрывается, когда все шаги done) */}
        <GettingStarted
          hasFlower={hasFlower}
          hasStock={hasStock}
          hasCustomer={hasCustomer}
          hasOrder={hasOrder}
        />

        {/* Переключатель периода + карточки KPI */}
        <div className="space-y-3">
          <DashboardPeriodTabs
            activePeriod={period}
            activeFrom={rawFrom}
            activeTo={rawTo}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {stats.map((stat) => (
              <StatsCard key={stat.label} {...stat} />
            ))}
          </div>
        </div>

        {/* Заказы */}
        <UpcomingOrdersWidget orders={upcomingOrders} />
      </div>

      {/* Правая панель — Напоминания (заказы + склад в одном attention-center) */}
      <div className="w-full xl:w-64 shrink-0 xl:sticky xl:top-6">
        <DashboardRemindersPanel
          stockAlerts={stockAlerts}
          isInventoryNotStarted={isInventoryNotStarted}
        />
      </div>

    </div>
  )
}
