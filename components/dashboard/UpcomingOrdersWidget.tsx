"use client"

import { useState } from "react"
import Link from "next/link"
import { ClipboardList, Plus, ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
  new:         { label: "Новый",    cls: "bg-[var(--bg-subtle)] text-[var(--text-secondary)]" },
  in_progress: { label: "В работе", cls: "bg-[var(--warn-bg)] text-[var(--warn-text)]"        },
  ready:       { label: "Готов",    cls: "bg-[var(--sage-bg)] text-[var(--sage-text)]"         },
  delivered:   { label: "Выдан",    cls: "bg-[var(--sage-bg)] text-[var(--sage-text)]"         },
}

const PAYMENT_LABEL: Record<string, { label: string; cls: string }> = {
  unpaid:  { label: "Не оплачен", cls: "text-[var(--brand-accent-text)]" },
  partial: { label: "Частично",   cls: "text-[var(--warn-text)]"         },
  paid:    { label: "Оплачен",    cls: "text-[var(--sage-text)]"         },
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
  if (o.stock_returned)   return { label: "Возвращён", cls: "text-[var(--text-secondary)]" }
  if (o.stock_written_off) return { label: "Списан",    cls: "text-[var(--sage-text)]"      }
  return                          { label: "Не списан", cls: "text-[var(--text-muted)]"     }
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
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-card)]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 pb-0">
        <h3 className="text-sm font-semibold text-[var(--text-heading)]">Ближайшие заказы</h3>
        <Link
          href="/orders"
          className="flex items-center gap-1 text-xs text-[var(--brand-accent)] hover:text-[var(--brand-accent-hover)] transition-colors"
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
                ? "bg-[var(--sidebar-active)] text-[var(--text-on-dark)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
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
            icon={
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-subtle)] mb-2">
                <ClipboardList className="h-6 w-6 text-[var(--text-muted)]" />
              </div>
            }
            title={EMPTY[tab]}
            action={
              <Link
                href="/orders/new"
                className="mt-3 flex items-center gap-1 text-xs text-[var(--brand-accent)] hover:text-[var(--brand-accent-hover)] font-medium transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Создать заказ
              </Link>
            }
          />
        ) : (
          <div className="space-y-1.5">
            {filtered.map((order) => {
              const st  = STATUS_CFG[order.status]  ?? { label: order.status, cls: "bg-[var(--bg-subtle)] text-[var(--text-secondary)]" }
              const pay = PAYMENT_LABEL[order.payment_status] ?? { label: order.payment_status, cls: "text-[var(--text-muted)]" }
              const stk = stockLabel(order)

              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-[var(--bg-subtle)] transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                        {order.order_number}
                      </span>
                      <Badge className={`h-auto px-1.5 py-0.5 text-[11px] border-0 ${st.cls}`}>
                        {st.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                      {order.customer_name ?? "Без имени"}
                    </p>
                    {(() => {
                      const dl = getDateLines(order, todayStr, tomorrowStr)
                      return (
                        <>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">{dl.line1}</p>
                          {dl.line2 && (
                            <p className="text-xs text-[var(--warn-text)] mt-0">{dl.line2}</p>
                          )}
                        </>
                      )
                    })()}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[11px] ${pay.cls}`}>{pay.label}</span>
                      <span className="text-[var(--text-muted)] text-[11px]">·</span>
                      <span className={`text-[11px] ${stk.cls}`}>{stk.label}</span>
                    </div>
                  </div>
                  <span className="text-xs text-[var(--text-muted)] group-hover:text-[var(--brand-accent)] transition-colors shrink-0 mt-0.5">
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
