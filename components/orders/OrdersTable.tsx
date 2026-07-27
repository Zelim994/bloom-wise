"use client"

import { useState } from "react"
import Link from "next/link"
import { Search, Plus, SlidersHorizontal, X } from "lucide-react"
import { AppIcons } from "@/lib/icons"
import type { OrderWithCustomer } from "@/app/actions/orders"
import { OrderStockBadge } from "@/components/orders/OrderStockBadge"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: "Новый", className: "bg-[var(--bg-subtle)] text-[var(--text-secondary)]" },
  in_progress: { label: "В работе", className: "bg-[var(--warn-bg)] text-[var(--warn-text)]" },
  ready: { label: "Готов", className: "bg-[var(--sage-bg)] text-[var(--sage-text)]" },
  delivered: { label: "Выдан", className: "bg-[var(--sage-bg)] text-[var(--sage-text)]" },
  cancelled: { label: "Отменён", className: "bg-[var(--brand-accent-bg)] text-[var(--brand-accent-text)]" },
}

const paymentStatusConfig: Record<string, { label: string; className: string }> = {
  unpaid: { label: "Не оплачен", className: "text-[var(--brand-accent-text)]" },
  partial: { label: "Частично", className: "text-[var(--warn-text)]" },
  paid: { label: "Оплачен", className: "text-[var(--sage-text)]" },
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
  { key: "all",             label: "Любой" },
  { key: "not_written_off", label: "Не списан" },
  { key: "written_off",     label: "Списан" },
  { key: "returned",        label: "Возвращён" },
]

const PAYMENT_FILTERS: { key: PaymentFilter; label: string }[] = [
  { key: "all",     label: "Любая" },
  { key: "open",    label: "Не закрыто" },
  { key: "unpaid",  label: "Не оплачено" },
  { key: "partial", label: "Частично" },
  { key: "paid",    label: "Оплачено" },
]

const STOCK_CHIP_LABELS: Partial<Record<StockFilter, string>> = {
  not_written_off: "Склад: не списан",
  written_off: "Склад: списан",
  returned: "Склад: возвращён",
}

const PAYMENT_CHIP_LABELS: Partial<Record<PaymentFilter, string>> = {
  open: "Оплата: не закрыта",
  unpaid: "Оплата: не оплачена",
  partial: "Оплата: частично",
  paid: "Оплата: оплачена",
}

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

  const activeAdvancedFilterCount =
    Number(stockFilter !== "all") + Number(paymentFilter !== "all")
  const hasActiveAdvancedFilters = activeAdvancedFilterCount > 0

  const hasSearchQuery = q.length > 0
  const hasActiveClientFilters = hasSearchQuery || stockFilter !== "all" || paymentFilter !== "all"
  const hasSourceOrders = orders.length > 0
  const isTrueEmpty = activeStatus === "all" && !hasSourceOrders
  const isStatusEmpty = activeStatus !== "all" && !hasSourceOrders
  const isFilteredEmpty = hasSourceOrders && filtered.length === 0 && hasActiveClientFilters

  return (
    <div className="space-y-3">
      {/* Search + filters */}
      <div className="flex flex-col gap-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по номеру, имени или телефону"
            className="w-full pl-9 pr-4 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-card)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)] focus:border-transparent placeholder:text-[var(--text-muted)]"
          />
        </div>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)] focus:border-transparent"
        >
          <option value="newest">Сначала новые</option>
          <option value="oldest">Сначала старые</option>
          <option value="unpaid_first">Сначала неоплаченные</option>
          <option value="stock_first">Сначала не списан склад</option>
        </select>
        <DropdownMenu>
          <DropdownMenuTrigger
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)] focus:border-transparent transition-colors whitespace-nowrap"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Фильтры
            {activeAdvancedFilterCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--brand-accent)] text-white text-[11px] font-semibold leading-none">
                {activeAdvancedFilterCount}
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuRadioGroup
              value={stockFilter}
              onValueChange={(value) => setStockFilter(value as StockFilter)}
            >
              <DropdownMenuLabel>Статус склада</DropdownMenuLabel>
              {STOCK_FILTERS.map((f) => (
                <DropdownMenuRadioItem key={f.key} value={f.key}>
                  {f.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={paymentFilter}
              onValueChange={(value) => setPaymentFilter(value as PaymentFilter)}
            >
              <DropdownMenuLabel>Оплата</DropdownMenuLabel>
              {PAYMENT_FILTERS.map((f) => (
                <DropdownMenuRadioItem key={f.key} value={f.key}>
                  {f.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {hasActiveAdvancedFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {stockFilter !== "all" && (
            <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] text-xs font-medium text-[var(--text-secondary)]">
              {STOCK_CHIP_LABELS[stockFilter]}
              <button
                type="button"
                onClick={() => setStockFilter("all")}
                aria-label={`Убрать фильтр «${STOCK_CHIP_LABELS[stockFilter]}»`}
                className="flex items-center justify-center h-4 w-4 rounded-full hover:bg-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          )}
          {paymentFilter !== "all" && (
            <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] text-xs font-medium text-[var(--text-secondary)]">
              {PAYMENT_CHIP_LABELS[paymentFilter]}
              <button
                type="button"
                onClick={() => setPaymentFilter("all")}
                aria-label={`Убрать фильтр «${PAYMENT_CHIP_LABELS[paymentFilter]}»`}
                className="flex items-center justify-center h-4 w-4 rounded-full hover:bg-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setStockFilter("all")
              setPaymentFilter("all")
            }}
            className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-heading)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)] rounded px-1 py-0.5"
          >
            Очистить фильтры
          </button>
        </div>
      )}
      </div>

      {/* Table */}
      <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-card)] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AppIcons.order className="h-10 w-10 text-[var(--text-muted)] mb-3" aria-hidden="true" />
            {isTrueEmpty && (
              <>
                <p className="text-sm font-medium text-[var(--text-secondary)]">Заказов пока нет</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Создайте первый заказ, чтобы начать работу.</p>
                <Link
                  href="/orders/new"
                  className="mt-4 flex items-center gap-1.5 bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-hover)] text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
                >
                  <Plus className="h-4 w-4" />
                  Новый заказ
                </Link>
              </>
            )}
            {isStatusEmpty && (
              <>
                <p className="text-sm font-medium text-[var(--text-secondary)]">В этом статусе заказов нет</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Выберите другой статус или вернитесь ко всем заказам.</p>
                <Link
                  href="/orders"
                  className="mt-4 inline-flex items-center gap-1.5 border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-sm font-medium px-3.5 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
                >
                  Показать все заказы
                </Link>
              </>
            )}
            {isFilteredEmpty && (
              <>
                <p className="text-sm font-medium text-[var(--text-secondary)]">По выбранным условиям заказов не найдено</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Измените запрос или сбросьте поиск и фильтры.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("")
                    setStockFilter("all")
                    setPaymentFilter("all")
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-sm font-medium px-3.5 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
                >
                  Сбросить поиск и фильтры
                </button>
              </>
            )}
            {!isTrueEmpty && !isStatusEmpty && !isFilteredEmpty && (
              <p className="text-sm font-medium text-[var(--text-secondary)]">Заказы не найдены</p>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--divider)] bg-[var(--bg-subtle)]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">№</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Клиент</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide hidden md:table-cell">Тип</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide hidden lg:table-cell">Готов к</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Сумма</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide hidden sm:table-cell">Оплата</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide hidden xl:table-cell">Склад</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Статус</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((order, i) => {
                const status = statusConfig[order.status] ?? { label: order.status, className: "bg-[var(--bg-subtle)] text-[var(--text-secondary)]" }
                const payment = paymentStatusConfig[order.payment_status ?? "unpaid"]
                const isLast = i === sorted.length - 1
                const isDimmed = order.status === "delivered" || order.status === "cancelled"

                return (
                  <tr
                    key={order.id}
                    className={`border-b border-[var(--divider)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer ${isLast ? "border-0" : ""} ${isDimmed ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/orders/${order.id}`} className="block">
                        <span className="font-mono text-xs text-[var(--text-muted)]">{order.order_number ?? "—"}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/orders/${order.id}`} className="block">
                        <span className="font-medium text-[var(--text-primary)]">
                          {order.customers?.full_name ?? "Без имени"}
                        </span>
                        {order.customers?.phone && (
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">{order.customers.phone}</p>
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
                    <td className="px-4 py-3 hidden lg:table-cell text-[var(--text-secondary)] text-xs">
                      {order.ready_at
                        ? new Date(order.ready_at).toLocaleString("ru", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--text-primary)] tabular-nums">
                      {order.total_amount != null
                        ? `₽ ${order.total_amount.toLocaleString("ru", { maximumFractionDigits: 0 })}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      <span className={`text-xs font-medium ${payment?.className ?? "text-[var(--text-muted)]"}`}>
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
