"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Search, Truck, ChevronRight, Plus, XCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { PurchaseListRow } from "@/app/actions/purchases"

type FilterKey = "all" | "month" | "week"

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: "all",   label: "Все"          },
  { key: "month", label: "Этот месяц"   },
  { key: "week",  label: "Последние 7 дней" },
]

function startOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

function sevenDaysAgo() {
  return Date.now() - 7 * 24 * 60 * 60 * 1000
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("ru", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function fmtAmount(n: number | null) {
  if (n == null) return "—"
  return `₽ ${n.toLocaleString("ru", { maximumFractionDigits: 0 })}`
}

export function PurchasesListClient({ rows }: { rows: PurchaseListRow[] }) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterKey>("all")

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalCount   = rows.length
  const monthAmount  = useMemo(
    () => rows.filter((r) => new Date(r.purchase_date + "T00:00:00").getTime() >= startOfMonth())
              .reduce((s, r) => s + (r.total_amount ?? 0), 0),
    [rows]
  )
  const lastDate     = rows[0]?.purchase_date ?? null
  const suppliersSet = useMemo(
    () => new Set(rows.map((r) => r.supplier_id).filter(Boolean)),
    [rows]
  )

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return rows.filter((r) => {
      // date filter
      const ts = new Date(r.purchase_date + "T00:00:00").getTime()
      if (filter === "month" && ts < startOfMonth()) return false
      if (filter === "week"  && ts < sevenDaysAgo())  return false

      // search by supplier name or comment
      if (q) {
        const supplierName = (r.suppliers?.name ?? "").toLowerCase()
        const comment      = (r.comment ?? "").toLowerCase()
        if (!supplierName.includes(q) && !comment.includes(q)) return false
      }

      return true
    })
  }, [rows, filter, search])

  const filterCount = (key: FilterKey) => {
    const ts = new Date()
    if (key === "all") return totalCount
    return rows.filter((r) => {
      const d = new Date(r.purchase_date + "T00:00:00").getTime()
      return key === "month" ? d >= startOfMonth() : d >= sevenDaysAgo()
    }).length
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs text-zinc-400 mb-0.5">Поставок всего</p>
          <p className="text-xl font-bold text-zinc-900 tabular-nums">{totalCount}</p>
          <p className="text-[11px] text-zinc-400 mt-0.5">в истории</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs text-zinc-400 mb-0.5">Закуплено за месяц</p>
          <p className="text-xl font-bold text-zinc-900 tabular-nums">
            {monthAmount > 0
              ? `₽ ${monthAmount.toLocaleString("ru", { maximumFractionDigits: 0 })}`
              : "—"}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">сумма поставок</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs text-zinc-400 mb-0.5">Последняя поставка</p>
          <p className="text-base font-bold text-zinc-900 mt-1 leading-tight">
            {lastDate ? fmtDate(lastDate) : "—"}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {lastDate ? rows[0]?.suppliers?.name ?? "без поставщика" : "нет данных"}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs text-zinc-400 mb-0.5">Поставщиков</p>
          <p className="text-xl font-bold text-zinc-900 tabular-nums">{suppliersSet.size}</p>
          <p className="text-[11px] text-zinc-400 mt-0.5">активных</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {FILTER_TABS.map((tab) => {
            const count = filterCount(tab.key)
            const isActive = filter === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors whitespace-nowrap font-medium ${
                  isActive
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
                }`}
              >
                {tab.label}
                {tab.key !== "all" && count > 0 && (
                  <span className={`ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full ${
                    isActive ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-400"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          <Input
            placeholder="Поиск по поставщику..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 w-52 border-zinc-200 text-sm"
          />
        </div>
      </div>

      {/* Quick action */}
      <div>
        <Link
          href="/purchases/new"
          className="inline-flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Новая поставка
        </Link>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Truck className="h-10 w-10 text-zinc-200 mb-3" />
            <p className="text-sm font-medium text-zinc-500">Нет поставок</p>
            <p className="text-xs text-zinc-400 mt-1">Оформите первую поставку товара</p>
            <Link
              href="/purchases/new"
              className="mt-4 inline-flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              Новая поставка
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <XCircle className="h-8 w-8 text-zinc-200 mb-2" />
            <p className="text-sm text-zinc-500">Ничего не найдено</p>
            <button
              onClick={() => { setSearch(""); setFilter("all") }}
              className="mt-2 text-xs text-rose-500 hover:underline"
            >
              Сбросить фильтры
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">Дата</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">Поставщик</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden sm:table-cell">Позиций</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Сумма</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden md:table-cell">Статус</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const isLast = i === filtered.length - 1
                return (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/purchases/${r.id}`)}
                    className={`border-b border-zinc-50 hover:bg-rose-50/40 cursor-pointer transition-colors group ${isLast ? "border-0" : ""}`}
                  >
                    <td className="px-4 py-3 text-zinc-500 tabular-nums text-sm">
                      {fmtDate(r.purchase_date)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-zinc-800 group-hover:text-rose-600 transition-colors">
                        {r.suppliers?.name ?? (
                          <span className="text-zinc-400 font-normal italic">Без поставщика</span>
                        )}
                      </span>
                      {r.comment && (
                        <p className="text-xs text-zinc-400 mt-0.5 truncate max-w-[200px]">{r.comment}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">
                      <span className="text-zinc-600">{r.item_count}</span>
                      <span className="text-xs text-zinc-400 ml-1">
                        {r.item_count === 1 ? "позиция" : r.item_count >= 2 && r.item_count <= 4 ? "позиции" : "позиций"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-zinc-800 tabular-nums group-hover:text-rose-600 transition-colors">
                      {fmtAmount(r.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700">
                        Проведена
                      </span>
                    </td>
                    <td className="px-3 py-3 text-zinc-300 group-hover:text-rose-400 transition-colors">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-zinc-400 text-right">
          {filtered.length}{filter !== "all" ? ` из ${totalCount}` : ""} поставок
        </p>
      )}
    </div>
  )
}
