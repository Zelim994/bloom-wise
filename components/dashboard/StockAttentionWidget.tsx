import Link from "next/link"
import { AlertTriangle, Clock, CheckCircle2, ShoppingCart } from "lucide-react"
import type { StockAlert } from "@/components/dashboard/StockAlertsWidget"

export function StockAttentionWidget({ alerts }: { alerts: StockAlert[] }) {
  const lowItems  = alerts.filter((a) => a.type === "out" || a.type === "low").slice(0, 3)
  const agingItems = alerts.filter((a) => a.type === "aging").slice(0, 3)
  const hasIssues  = lowItems.length > 0 || agingItems.length > 0

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <div className="flex items-center justify-between px-5 py-4">
        <h3 className="text-sm font-semibold text-zinc-900">Склад</h3>
        <Link
          href="/inventory"
          className="text-xs text-zinc-400 hover:text-rose-500 transition-colors"
        >
          Открыть →
        </Link>
      </div>

      {!hasIssues ? (
        <div className="flex flex-col items-center justify-center py-8 px-5 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2" />
          <p className="text-sm font-medium text-zinc-700">Всё в порядке</p>
          <p className="text-xs text-zinc-400 mt-0.5">Нет проблем на складе</p>
        </div>
      ) : (
        <div className="px-3 pb-4 space-y-4">
          {lowItems.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 px-2 mb-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-[11px] font-semibold text-orange-500 uppercase tracking-wide">
                  Мало на складе
                </span>
              </div>
              <div className="space-y-1">
                {lowItems.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-lg px-3 py-2 bg-orange-50"
                  >
                    <span className="text-xs text-zinc-700 truncate pr-2">{item.name}</span>
                    <span className="text-xs font-semibold text-orange-600 shrink-0 tabular-nums">
                      {item.stock} / {item.min} шт
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {agingItems.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 px-2 mb-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide">
                  Залежались
                </span>
              </div>
              <div className="space-y-1">
                {agingItems.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-lg px-3 py-2 bg-amber-50"
                  >
                    <span className="text-xs text-zinc-700 truncate pr-2">{item.name}</span>
                    <span className="text-xs font-semibold text-amber-600 shrink-0 tabular-nums">
                      {item.days} дн
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <Link
            href="/purchases/new"
            className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium bg-rose-500 hover:bg-rose-600 text-white transition-colors"
          >
            <ShoppingCart className="h-4 w-4" />
            Оформить закупку
          </Link>
        </div>
      )}
    </div>
  )
}
