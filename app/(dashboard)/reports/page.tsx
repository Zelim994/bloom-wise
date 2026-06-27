import { BarChart3, TrendingUp, ShoppingBag, AlertTriangle, CreditCard } from "lucide-react"
import { getMonthlyStats, getTopFlowers } from "@/app/actions/reports"

const statusLabels: Record<string, string> = {
  new: "Новые",
  in_progress: "В работе",
  ready: "Готовы",
  delivered: "Выданы",
  cancelled: "Отменены",
}

const statusDot: Record<string, string> = {
  new: "bg-blue-400",
  in_progress: "bg-amber-400",
  ready: "bg-emerald-400",
  delivered: "bg-zinc-300",
  cancelled: "bg-red-300",
}

export default async function ReportsPage() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const [stats, topFlowers] = await Promise.all([
    getMonthlyStats(year, month),
    getTopFlowers(),
  ])

  const monthName = now.toLocaleDateString("ru", { month: "long", year: "numeric" })
  const maxQty = topFlowers[0]?.quantity ?? 1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Отчёты</h1>
          <p className="text-sm text-zinc-500 mt-0.5 capitalize">{monthName}</p>
        </div>
      </div>

      {/* Ключевые метрики */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50">
              <TrendingUp className="h-3.5 w-3.5 text-rose-500" />
            </div>
            <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wide">Выручка</p>
          </div>
          <p className="text-2xl font-bold text-zinc-900 tabular-nums">
            ₽{stats.revenue.toLocaleString("ru", { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-zinc-400 mt-1">{stats.orderCount} заказов</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50">
              <CreditCard className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wide">Получено</p>
          </div>
          <p className="text-2xl font-bold text-zinc-900 tabular-nums">
            ₽{stats.paid.toLocaleString("ru", { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            {stats.revenue > 0
              ? `${((stats.paid / stats.revenue) * 100).toFixed(0)}% от выручки`
              : "—"}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50">
              <ShoppingBag className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wide">Ср. чек</p>
          </div>
          <p className="text-2xl font-bold text-zinc-900 tabular-nums">
            {stats.avgCheck > 0
              ? `₽${stats.avgCheck.toLocaleString("ru", { maximumFractionDigits: 0 })}`
              : "—"}
          </p>
          <p className="text-xs text-zinc-400 mt-1">{stats.orderCount} заказов</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wide">Списания</p>
          </div>
          <p className="text-2xl font-bold text-zinc-900 tabular-nums">
            {stats.writeoffsLoss > 0
              ? `₽${stats.writeoffsLoss.toLocaleString("ru", { maximumFractionDigits: 0 })}`
              : "—"}
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            {stats.revenue > 0 && stats.writeoffsLoss > 0
              ? `${((stats.writeoffsLoss / stats.revenue) * 100).toFixed(1)}% от выручки`
              : "потерь нет"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Заказы по статусу */}
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-100">
            <h2 className="text-sm font-semibold text-zinc-800">Заказы по статусу</h2>
          </div>
          {stats.ordersByStatus.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">Нет данных за месяц</p>
          ) : (
            <div className="p-5 space-y-3">
              {stats.ordersByStatus
                .sort((a, b) => b.count - a.count)
                .map(({ status, count }) => {
                  const pct = stats.orderCount > 0 ? (count / stats.orderCount) * 100 : 0
                  return (
                    <div key={status} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${statusDot[status] ?? "bg-zinc-300"}`} />
                          <span className="text-zinc-700">{statusLabels[status] ?? status}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-zinc-400">{pct.toFixed(0)}%</span>
                          <span className="font-semibold text-zinc-800 w-6 text-right tabular-nums">{count}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${statusDot[status] ?? "bg-zinc-300"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>

        {/* Топ цветов */}
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-rose-400" />
            <h2 className="text-sm font-semibold text-zinc-800">Топ цветов в букетах</h2>
          </div>
          {topFlowers.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">Нет данных по букетам</p>
          ) : (
            <div className="p-5 space-y-3">
              {topFlowers.map((flower, i) => {
                const pct = (flower.quantity / maxQty) * 100
                return (
                  <div key={flower.flower_id} className="flex items-center gap-3">
                    <span className="text-xs text-zinc-400 w-4 tabular-nums">{i + 1}</span>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-zinc-800 truncate">{flower.name}</span>
                        <span className="text-xs text-zinc-500 tabular-nums shrink-0 ml-2">
                          {flower.quantity} {flower.unit}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-rose-400 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
