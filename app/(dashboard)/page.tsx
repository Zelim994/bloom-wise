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
import { RecentOrdersWidget, type OrderPreview } from "@/components/dashboard/RecentOrdersWidget"
import { StockAlertsWidget, type StockAlert } from "@/components/dashboard/StockAlertsWidget"
import { OrdersAttentionWidget } from "@/components/dashboard/OrdersAttentionWidget"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/services/organizationService"

const TYPE_LABELS: Record<string, string> = {
  pickup: "Самовывоз",
  delivery: "Доставка",
  event: "Мероприятие",
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)

  let recentOrders: OrderPreview[] = []
  let stockAlerts: StockAlert[] = []
  let stats: StatItem[] = []

  if (orgId) {
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]
    const tomorrowStr = new Date(today.getTime() + 86_400_000).toISOString().split("T")[0]
    const dayAfterStr = new Date(today.getTime() + 2 * 86_400_000).toISOString().split("T")[0]
    const tenDaysAgo = new Date(today.getTime() - 10 * 86_400_000).toISOString()

    const [ordersRes, flowersRes, stockRes, agingRes, writeoffsRes, tomorrowRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_number, status, total_amount, profit, order_date, created_at, type, customers(full_name)")
        .eq("organization_id", orgId)
        .gte("order_date", todayStr)
        .lt("order_date", tomorrowStr)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("flowers")
        .select("id, name, min_stock")
        .eq("organization_id", orgId)
        .eq("is_active", true),
      supabase
        .from("flower_stock")
        .select("flower_id, current_stock"),
      supabase
        .from("inventory_items")
        .select("flower_id, quantity_remaining, arrived_at")
        .eq("organization_id", orgId)
        .gt("quantity_remaining", 0)
        .lt("arrived_at", tenDaysAgo),
      supabase
        .from("writeoffs")
        .select("loss_amount")
        .eq("organization_id", orgId)
        .gte("writeoff_date", todayStr)
        .lt("writeoff_date", tomorrowStr),
      supabase
        .from("orders")
        .select("id, type")
        .eq("organization_id", orgId)
        .gte("order_date", tomorrowStr)
        .lt("order_date", dayAfterStr)
        .not("status", "in", "(cancelled,delivered)"),
    ])

    // Заказы сегодня → RecentOrdersWidget
    recentOrders = (ordersRes.data ?? []).map((o) => {
      const row = o as {
        id: string; order_number: string; status: string; total_amount: number | null
        order_date: string; created_at: string; type: string
        customers: { full_name: string } | null
      }
      return {
        id: row.id,
        number: row.order_number,
        customer: row.customers?.full_name ?? "Без имени",
        bouquet: TYPE_LABELS[row.type] ?? row.type,
        amount: row.total_amount != null
          ? `₽ ${Number(row.total_amount).toLocaleString("ru", { maximumFractionDigits: 0 })}`
          : "—",
        status: row.status,
        time: new Date(row.created_at).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" }),
      }
    })

    // Склад — внимание → StockAlertsWidget
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

    // Карточки показателей
    const todayOrders = ordersRes.data ?? []
    type OrderRow = { total_amount: number | null; profit: number | null }
    const todayRevenue = todayOrders.reduce((s, o) => s + ((o as unknown as OrderRow).total_amount ?? 0), 0)
    const todayProfit = todayOrders.reduce((s, o) => s + ((o as unknown as OrderRow).profit ?? 0), 0)
    const writeoffTotal = (writeoffsRes.data ?? []).reduce((s, w) => s + (w.loss_amount ?? 0), 0)
    const tomorrowOrders = tomorrowRes.data ?? []
    const tomorrowDeliveries = tomorrowOrders.filter((o) => (o as { type: string }).type === "delivery").length
    const totalStock = [...stockMap.values()].reduce((s, v) => s + v, 0)
    const stockWithItems = [...stockMap.values()].filter((v) => v > 0).length
    const lowStockCount = outAlerts.length + lowAlerts.length
    const agingCount = agingAlerts.length

    const fmt = (n: number) =>
      n > 0 ? `₽ ${n.toLocaleString("ru", { maximumFractionDigits: 0 })}` : "₽ 0"

    stats = [
      {
        label: "Выручка сегодня",
        value: fmt(todayRevenue),
        trend: todayOrders.length > 0 ? `${todayOrders.length} заказов` : "Нет заказов",
        up: todayRevenue > 0,
        icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-50",
      },
      {
        label: "Прибыль сегодня",
        value: fmt(todayProfit),
        trend: todayProfit > 0 ? "Есть прибыль" : "Нет данных",
        up: todayProfit > 0,
        icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-50",
      },
      {
        label: "Заказы сегодня",
        value: String(todayOrders.length),
        trend: todayOrders.length > 0 ? "активных" : "Нет заказов",
        up: todayOrders.length > 0,
        icon: ShoppingBag, color: "text-blue-500", bg: "bg-blue-50",
      },
      {
        label: "Списания сегодня",
        value: writeoffTotal > 0 ? fmt(writeoffTotal) : "—",
        trend: writeoffTotal > 0 ? "убыток" : "Нет списаний",
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
    <div className="space-y-6">
      {/* Приветствие + быстрые действия */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-900">Добро пожаловать 🌸</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Суббота, 7 июня 2026</p>
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

      {/* Карточки показателей */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatsCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* Заказы + Склад */}
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2">
          <RecentOrdersWidget orders={recentOrders} />
        </div>
        <div>
          <StockAlertsWidget alerts={stockAlerts} />
        </div>
      </div>

      {/* Заказы требуют внимания */}
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-1">
          <OrdersAttentionWidget />
        </div>
      </div>
    </div>
  )
}
