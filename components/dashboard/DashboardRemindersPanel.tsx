import Link from "next/link"
import { ShoppingBag, PackageSearch, CheckCircle2 } from "lucide-react"
import { getOrderReminderItems, plural } from "@/components/dashboard/OrdersAttentionWidget"
import type { StockAlert } from "@/components/dashboard/StockAlertsWidget"

type DashboardRemindersPanelProps = {
  stockAlerts: StockAlert[]
  isInventoryNotStarted?: boolean
}

const STOCK_ORDER: Record<StockAlert["type"], number> = { out: 0, low: 1, aging: 2 }
const STOCK_BADGE: Record<StockAlert["type"], string> = {
  out: "Закончился",
  low: "Мало",
  aging: "Залежался",
}
const STOCK_COLORS: Record<StockAlert["type"], { bg: string; hoverBg: string; text: string; arrow: string }> = {
  out:   { bg: "bg-red-50",    hoverBg: "hover:bg-red-100",    text: "text-red-600",    arrow: "text-red-400" },
  low:   { bg: "bg-orange-50", hoverBg: "hover:bg-orange-100", text: "text-orange-600", arrow: "text-orange-400" },
  aging: { bg: "bg-amber-50",  hoverBg: "hover:bg-amber-100",  text: "text-amber-600",  arrow: "text-amber-400" },
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-1"

export async function DashboardRemindersPanel({
  stockAlerts,
  isInventoryNotStarted,
}: DashboardRemindersPanelProps) {
  const { hasOrders, items } = await getOrderReminderItems()
  const visibleOrderItems = items.filter((item) => item.count > 0)

  const visibleStockAlerts = [...stockAlerts]
    .sort((a, b) => STOCK_ORDER[a.type] - STOCK_ORDER[b.type])
    .slice(0, 5)

  const showOrdersSection = !hasOrders || visibleOrderItems.length > 0
  const showStockSection = Boolean(isInventoryNotStarted) || stockAlerts.length > 0

  const panelIsCalm =
    hasOrders &&
    visibleOrderItems.length === 0 &&
    !isInventoryNotStarted &&
    stockAlerts.length === 0

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-5">
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
        Напоминания
      </h3>

      {panelIsCalm ? (
        <div className="flex flex-col items-center justify-center py-6 px-2 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2" />
          <p className="text-sm font-medium text-zinc-700">Всё спокойно</p>
          <p className="text-xs text-zinc-400 mt-0.5">
            Нет задач, которые требуют внимания.
          </p>
        </div>
      ) : (
        <>
          {showOrdersSection && (
            <section className="space-y-2">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">
                Заказы
              </span>

              {!hasOrders ? (
                <div className="flex flex-col items-center justify-center py-6 px-2 text-center">
                  <ShoppingBag className="h-8 w-8 text-zinc-300 mb-2" />
                  <p className="text-sm font-medium text-zinc-700">Заказов пока нет</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Создайте первый заказ, чтобы появились напоминания.
                  </p>
                  <Link
                    href="/orders/new"
                    className="mt-3 inline-flex items-center justify-center rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3 py-2 transition-colors"
                  >
                    Создать заказ
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleOrderItems.map((item) => {
                    const active =
                      item.urgency === "warn"
                        ? "border-amber-200 bg-amber-50 hover:bg-amber-100"
                        : "border-sky-200 bg-sky-50 hover:bg-sky-100"
                    const iconColor =
                      item.urgency === "warn" ? "text-amber-500" : "text-sky-500"
                    const countColor =
                      item.urgency === "warn" ? "text-amber-700" : "text-sky-700"
                    const linkColor =
                      item.urgency === "warn" ? "text-amber-400" : "text-sky-400"

                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        className={`block rounded-lg border p-3 transition-colors ${active} ${FOCUS_RING}`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <item.icon className={`h-4 w-4 shrink-0 mt-0.5 ${iconColor}`} />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-zinc-800 leading-snug">{item.title}</p>
                              <p className={`text-xs font-semibold mt-0.5 ${countColor}`}>
                                {item.count} {plural(item.count)}
                              </p>
                            </div>
                          </div>
                          <span className={`text-xs font-medium shrink-0 mt-0.5 ${linkColor}`}>
                            →
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {showStockSection && (
            <section className="space-y-2">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">
                Склад
              </span>

              {isInventoryNotStarted ? (
                <div className="flex flex-col items-center justify-center py-6 px-2 text-center">
                  <PackageSearch className="h-8 w-8 text-zinc-300 mb-2" />
                  <p className="text-sm font-medium text-zinc-700">Склад ещё не настроен</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Добавьте цветы и оформите первую закупку.
                  </p>
                  <Link
                    href="/purchases/new"
                    className="mt-3 inline-flex items-center justify-center rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3 py-2 transition-colors"
                  >
                    Оформить закупку
                  </Link>
                </div>
              ) : (
                <div className="space-y-1">
                  {visibleStockAlerts.map((item) => {
                    const colors = STOCK_COLORS[item.type]
                    return (
                      <Link
                        key={`${item.type}-${item.name}`}
                        href="/inventory"
                        className={`flex items-center justify-between rounded-lg px-3 py-2 transition-colors ${colors.bg} ${colors.hoverBg} ${FOCUS_RING}`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <span className="text-xs text-zinc-700 truncate block">{item.name}</span>
                          <span className={`text-[10px] font-semibold uppercase tracking-wide ${colors.text}`}>
                            {STOCK_BADGE[item.type]}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-xs font-semibold tabular-nums ${colors.text}`}>
                            {item.type === "aging" ? `${item.days} дн` : `${item.stock} / ${item.min} шт`}
                          </span>
                          <span className={`text-xs font-medium ${colors.arrow}`}>→</span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
