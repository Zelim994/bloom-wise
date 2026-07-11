"use client"

import { useState } from "react"
import Link from "next/link"
import { ClipboardList, Plus, ArrowRight } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"

export type UpcomingOrder = {
  id: string
  order_number: string
  status: string
  payment_status: string
  stock_written_off: boolean
  stock_returned: boolean
  order_date: string
  ready_at: string | null
  customer_name: string | null
}

type Tab = "today" | "tomorrow" | "7d"

const TABS: { key: Tab; label: string }[] = [
  { key: "today",    label: "Сегодня" },
  { key: "tomorrow", label: "Завтра"  },
  { key: "7d",       label: "7 дней"  },
]

const EMPTY: Record<Tab, string> = {
  today:    "На сегодня заказов нет",
  tomorrow: "На завтра заказов нет",
  "7d":     "На ближайшие 7 дней заказов нет",
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  new:         { label: "Новый",    cls: "bg-blue-100 text-blue-700"    },
  in_progress: { label: "В работе", cls: "bg-amber-100 text-amber-700"  },
  ready:       { label: "Готов",    cls: "bg-emerald-100 text-emerald-700" },
  delivered:   { label: "Выдан",    cls: "bg-zinc-100 text-zinc-500"    },
}

const PAYMENT_LABEL: Record<string, { label: string; cls: string }> = {
  unpaid:  { label: "Не оплачен", cls: "text-red-500"     },
  partial: { label: "Частично",   cls: "text-amber-600"   },
  paid:    { label: "Оплачен",    cls: "text-emerald-600" },
}

function pad(d: Date) { return d.toISOString().split("T")[0] }

function fmtDate(dateStr: string, todayStr: string, tomorrowStr: string): string {
  if (dateStr === todayStr)    return "Сегодня"
  if (dateStr === tomorrowStr) return "Завтра"
  return new Date(dateStr + "T00:00:00").toLocaleDateString("ru", { day: "numeric", month: "short" })
}

function getDateLines(
  order: UpcomingOrder,
  todayStr: string,
  tomorrowStr: string,
): { line1: string; line2?: string } {
  if (!order.ready_at) {
    return { line1: fmtDate(order.order_date, todayStr, tomorrowStr) }
  }
  const readyDateStr = order.ready_at.split("T")[0]
  const readyTime = new Date(order.ready_at).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })

  if (readyDateStr === order.order_date) {
    return { line1: `${fmtDate(order.order_date, todayStr, tomorrowStr)} · ${readyTime}` }
  }
  return {
    line1: `Заказ: ${fmtDate(order.order_date, todayStr, tomorrowStr)}`,
    line2: `Готовность: ${fmtDate(readyDateStr, todayStr, tomorrowStr)} · ${readyTime}`,
  }
}

function stockLabel(o: UpcomingOrder): { label: string; cls: string } {
  if (o.stock_returned)   return { label: "Возвращён", cls: "text-sky-600"     }
  if (o.stock_written_off) return { label: "Списан",    cls: "text-emerald-600" }
  return                          { label: "Не списан", cls: "text-zinc-400"    }
}

export function UpcomingOrdersWidget({ orders }: { orders: UpcomingOrder[] }) {
  const [tab, setTab] = useState<Tab>("today")

  const today    = new Date()
  const todayStr    = pad(today)
  const tomorrowStr = pad(new Date(today.getTime() + 86_400_000))
  const sevenStr    = pad(new Date(today.getTime() + 7 * 86_400_000))

  const filtered = orders.filter((o) => {
    if (tab === "today")    return o.order_date === todayStr
    if (tab === "tomorrow") return o.order_date === tomorrowStr
    return o.order_date >= todayStr && o.order_date < sevenStr
  }).slice(0, 5)

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 pb-0">
        <h3 className="text-sm font-semibold text-zinc-900">Ближайшие заказы</h3>
        <Link
          href="/orders"
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-rose-500 transition-colors"
        >
          Все заказы <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-5 pt-3 pb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              tab === t.key
                ? "bg-zinc-900 text-white"
                : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="px-3 pb-4">
        {filtered.length === 0 ? (
          <EmptyState
            className="py-10"
            icon={<ClipboardList className="h-8 w-8 text-zinc-200 mb-2" />}
            title={EMPTY[tab]}
            action={
              <Link
                href="/orders/new"
                className="mt-3 flex items-center gap-1 text-xs text-rose-500 hover:text-rose-600 font-medium transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Создать заказ
              </Link>
            }
          />
        ) : (
          <div className="space-y-1.5">
            {filtered.map((order) => {
              const st  = STATUS_CFG[order.status]  ?? { label: order.status, cls: "bg-zinc-100 text-zinc-500" }
              const pay = PAYMENT_LABEL[order.payment_status] ?? { label: order.payment_status, cls: "text-zinc-400" }
              const stk = stockLabel(order)

              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-zinc-50 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-zinc-700">
                        {order.order_number}
                      </span>
                      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5 truncate">
                      {order.customer_name ?? "Без имени"}
                    </p>
                    {(() => {
                      const dl = getDateLines(order, todayStr, tomorrowStr)
                      return (
                        <>
                          <p className="text-xs text-zinc-400 mt-0.5">{dl.line1}</p>
                          {dl.line2 && (
                            <p className="text-xs text-amber-500 mt-0">{dl.line2}</p>
                          )}
                        </>
                      )
                    })()}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[11px] ${pay.cls}`}>{pay.label}</span>
                      <span className="text-zinc-200 text-[11px]">·</span>
                      <span className={`text-[11px] ${stk.cls}`}>{stk.label}</span>
                    </div>
                  </div>
                  <span className="text-xs text-zinc-300 group-hover:text-rose-400 transition-colors shrink-0 mt-0.5">
                    →
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
