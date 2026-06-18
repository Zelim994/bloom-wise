"use client"

import { useState } from "react"
import Link from "next/link"
import { ClipboardList, Search, Plus } from "lucide-react"
import type { OrderWithCustomer } from "@/app/actions/orders"
import { OrderStockBadge } from "@/components/orders/OrderStockBadge"

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: "Новый", className: "bg-blue-100 text-blue-700" },
  in_progress: { label: "В работе", className: "bg-amber-100 text-amber-700" },
  ready: { label: "Готов", className: "bg-emerald-100 text-emerald-700" },
  delivered: { label: "Выдан", className: "bg-zinc-100 text-zinc-500" },
  cancelled: { label: "Отменён", className: "bg-red-100 text-red-600" },
}

const paymentStatusConfig: Record<string, { label: string; className: string }> = {
  unpaid: { label: "Не оплачен", className: "text-red-600" },
  partial: { label: "Частично", className: "text-amber-600" },
  paid: { label: "Оплачен", className: "text-emerald-600" },
}

const typeIcons: Record<string, string> = {
  pickup: "🏪",
  delivery: "🚚",
  event: "🎉",
}

type Props = {
  orders: OrderWithCustomer[]
  activeStatus: string
  initialStockFilter?: StockFilter
  initialPaymentFilter?: PaymentFilter
}

type StockFilter = "all" | "not_written_off" | "written_off" | "returned"
type PaymentFilter = "all" | "unpaid" | "partial" | "paid" | "open"
type SortKey = "newest" | "oldest" | "unpaid_first" | "stock_first"

const STOCK_FILTERS: { key: StockFilter; label: string }[] = [
  { key: "all",             label: "Все" },
  { key: "not_written_off", label: "Не списан" },
  { key: "written_off",     label: "Списан" },
  { key: "returned",        label: "Возвращён" },
]

const PAYMENT_FILTERS: { key: PaymentFilter; label: string }[] = [
  { key: "all",     label: "Все оплаты" },
  { key: "open",    label: "Не закрыто" },
  { key: "unpaid",  label: "Не оплачено" },
  { key: "partial", label: "Частично" },
  { key: "paid",    label: "Оплачено" },
]

const PAYMENT_ORDER: Record<string, number> = { unpaid: 0, partial: 1, paid: 2 }
const STOCK_ORDER = (o: OrderWithCustomer) =>
  o.stock_returned ? 2 : o.stock_written_off ? 1 : 0

function sortOrders(orders: OrderWithCustomer[], key: SortKey): OrderWithCustomer[] {
  const copy = [...orders]
  if (key === "newest") {
    return copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }
  if (key === "oldest") {
    return copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }
  if (key === "unpaid_first") {
    return copy.sort(
      (a, b) =>
        (PAYMENT_ORDER[a.payment_status ?? "unpaid"] ?? 0) -
        (PAYMENT_ORDER[b.payment_status ?? "unpaid"] ?? 0)
    )
  }
  if (key === "stock_first") {
    return copy.sort((a, b) => STOCK_ORDER(a) - STOCK_ORDER(b))
  }
  return copy
}

function getStockKey(o: OrderWithCustomer): StockFilter {
  if (o.stock_written_off && o.stock_returned) return "returned"
  if (o.stock_written_off) return "written_off"
  return "not_written_off"
}

export function OrdersTable({ orders, activeStatus, initialStockFilter, initialPaymentFilter }: Props) {
  const [search, setSearch] = useState("")
  const [stockFilter, setStockFilter] = useState<StockFilter>(initialStockFilter ?? "all")
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>(initialPaymentFilter ?? "all")
  const [sortKey, setSortKey] = useState<SortKey>("newest")

  const q = search.trim().toLowerCase()
  const filtered = orders.filter((o) => {
    if (q) {
      const matchText =
        (o.order_number ?? "").toLowerCase().includes(q) ||
        (o.customers?.full_name ?? "").toLowerCase().includes(q) ||
        (o.customers?.phone ?? "").includes(q)
      if (!matchText) return false
    }
    if (stockFilter !== "all") {
      if (getStockKey(o) !== stockFilter) return false
      // Отменённый заказ без списания — чистая отмена, действий не требует
      if (stockFilter === "not_written_off" && o.status === "cancelled") return false
    }
    if (paymentFilter === "open") {
      const ps = o.payment_status ?? "unpaid"
      if (ps !== "unpaid" && ps !== "partial") return false
    } else if (paymentFilter !== "all" && (o.payment_status ?? "unpaid") !== paymentFilter) {
      return false
    }
    return true
  })
  const sorted = sortOrders(filtered, sortKey)

  return (
    <div className="space-y-3">
      {/* Search + filters */}
      <div className="flex flex-col gap-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по номеру, имени или телефону"
            className="w-full pl-9 pr-4 py-2 text-sm border border-zinc-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent placeholder:text-zinc-400"
          />
        </div>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="px-3 py-2 text-sm border border-zinc-200 rounded-lg bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
        >
          <option value="newest">Сначала новые</option>
          <option value="oldest">Сначала старые</option>
          <option value="unpaid_first">Сначала неоплаченные</option>
          <option value="stock_first">Сначала не списан склад</option>
        </select>
        <div className="flex gap-1">
          {STOCK_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStockFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                stockFilter === f.key
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 border border-zinc-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Payment filter */}
      <div className="flex gap-1 flex-wrap">
        {PAYMENT_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setPaymentFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              paymentFilter === f.key
                ? "bg-zinc-900 text-white"
                : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 border border-zinc-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList className="h-10 w-10 text-zinc-200 mb-3" />
            <p className="text-sm font-medium text-zinc-500">
              {q ? "Ничего не найдено" : "Нет заказов"}
            </p>
            {!q && activeStatus === "all" && (
              <>
                <p className="text-xs text-zinc-400 mt-1">Создайте первый заказ</p>
                <Link
                  href="/orders/new"
                  className="mt-4 flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Новый заказ
                </Link>
              </>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">№</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">Клиент</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden md:table-cell">Тип</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden lg:table-cell">Готов к</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Сумма</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden sm:table-cell">Оплата</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden xl:table-cell">Склад</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Статус</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((order, i) => {
                const status = statusConfig[order.status] ?? { label: order.status, className: "bg-zinc-100 text-zinc-500" }
                const payment = paymentStatusConfig[order.payment_status ?? "unpaid"]
                const isLast = i === sorted.length - 1
                const isDimmed = order.status === "delivered" || order.status === "cancelled"

                return (
                  <tr
                    key={order.id}
                    className={`border-b border-zinc-50 hover:bg-zinc-50/80 transition-colors cursor-pointer ${isLast ? "border-0" : ""} ${isDimmed ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/orders/${order.id}`} className="block">
                        <span className="font-mono text-xs text-zinc-400">{order.order_number ?? "—"}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/orders/${order.id}`} className="block">
                        <span className="font-medium text-zinc-800">
                          {order.customers?.full_name ?? "Без имени"}
                        </span>
                        {order.customers?.phone && (
                          <p className="text-xs text-zinc-400 mt-0.5">{order.customers.phone}</p>
                        )}
                        <div className="mt-1 xl:hidden">
                          <OrderStockBadge
                            stockWrittenOff={order.stock_written_off}
                            stockReturned={order.stock_returned}
                          />
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-base" title={order.type ?? ""}>
                        {typeIcons[order.type ?? "pickup"] ?? "📦"}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-zinc-500 text-xs">
                      {order.ready_at
                        ? new Date(order.ready_at).toLocaleString("ru", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-zinc-800 tabular-nums">
                      {order.total_amount != null
                        ? `₽ ${order.total_amount.toLocaleString("ru", { maximumFractionDigits: 0 })}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      <span className={`text-xs font-medium ${payment?.className ?? "text-zinc-400"}`}>
                        {payment?.label ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right hidden xl:table-cell">
                      <OrderStockBadge
                        stockWrittenOff={order.stock_written_off}
                        stockReturned={order.stock_returned}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
