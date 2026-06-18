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

const stats: StatItem[] = [
  { label: "Выручка сегодня",   value: "₽ 24 500", trend: "+12%",            up: true,  icon: TrendingUp,   color: "text-emerald-500", bg: "bg-emerald-50" },
  { label: "Прибыль сегодня",   value: "₽ 11 800", trend: "+8%",             up: true,  icon: TrendingUp,   color: "text-emerald-500", bg: "bg-emerald-50" },
  { label: "Заказы сегодня",    value: "7",         trend: "+2 к вчера",     up: true,  icon: ShoppingBag,  color: "text-blue-500",    bg: "bg-blue-50"    },
  { label: "Списания сегодня",  value: "₽ 1 200",  trend: "-3% к норме",    up: false, icon: Minus,        color: "text-rose-500",    bg: "bg-rose-50"    },
  { label: "Заказы на завтра",  value: "4",         trend: "2 доставки",     up: true,  icon: Clock,        color: "text-violet-500",  bg: "bg-violet-50"  },
  { label: "Остаток склада",    value: "248 шт",    trend: "14 категорий",   up: true,  icon: Package,      color: "text-amber-500",   bg: "bg-amber-50"   },
  { label: "Низкий остаток",    value: "3 товара",  trend: "Требуют закупки",up: false, icon: AlertTriangle,color: "text-orange-500",  bg: "bg-orange-50"  },
  { label: "Залежались",        value: "5 позиций", trend: "Старше 10 дней", up: false, icon: TrendingDown, color: "text-red-500",     bg: "bg-red-50"     },
]

const stockAlerts: StockAlert[] = [
  { name: "Роза красная 60см",   stock: 3, min: 10, type: "low"   },
  { name: "Эвкалипт",            stock: 5, min: 8,  type: "low"   },
  { name: "Тюльпан белый",       stock: 0, min: 15, type: "out"   },
  { name: "Гортензия",           stock: 2, min: 5,  type: "aging", days: 12 },
  { name: "Пионовидная роза",    stock: 4, min: 6,  type: "aging", days: 8  },
]

const TYPE_LABELS: Record<string, string> = {
  pickup: "Самовывоз",
  delivery: "Доставка",
  event: "Мероприятие",
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)

  let recentOrders: OrderPreview[] = []

  if (orgId) {
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]
    const tomorrowStr = new Date(today.getTime() + 86_400_000).toISOString().split("T")[0]

    const { data } = await supabase
      .from("orders")
      .select("id, order_number, status, total_amount, order_date, created_at, type, customers(full_name)")
      .eq("organization_id", orgId)
      .gte("order_date", todayStr)
      .lt("order_date", tomorrowStr)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(6)

    recentOrders = (data ?? []).map((o) => {
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
