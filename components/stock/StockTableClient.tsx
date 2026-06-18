"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Search, Package, AlertTriangle, Clock, XCircle, ChevronRight, ShoppingCart, ShoppingBag } from "lucide-react"
import { Input } from "@/components/ui/input"

export type StockRow = {
  id: string
  name: string
  category: string
  sku: string | null
  min_stock: number | null
  sale_price: number | null
  unit: string
  description: string | null
  current_stock: number
  oldest_arrived_at: string | null
  oldest_cost_price: number | null
  days_on_shelf: number | null
  status: "ok" | "low" | "aging" | "no_stock"
}

type StockFilter = "all" | "low" | "aging" | "no_stock"

const FILTER_TABS: { key: StockFilter; label: string }[] = [
  { key: "all",      label: "Все"            },
  { key: "low",      label: "Низкий остаток" },
  { key: "aging",    label: "Залежались"     },
  { key: "no_stock", label: "Нет остатка"    },
]

const STATUS_CFG = {
  ok:       { label: "В норме",    cls: "bg-emerald-100 text-emerald-700" },
  low:      { label: "Мало",       cls: "bg-amber-100 text-amber-700"    },
  aging:    { label: "Залежался",  cls: "bg-orange-100 text-orange-700"  },
  no_stock: { label: "Нет остатка",cls: "bg-red-100 text-red-500"        },
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

function pluralDays(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} день`
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} дня`
  return `${n} дней`
}

export function StockTableClient({ rows }: { rows: StockRow[] }) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<StockFilter>("all")

  const lowCount     = useMemo(() => rows.filter((r) => r.status === "low").length, [rows])
  const agingCount   = useMemo(() => rows.filter((r) => r.status === "aging").length, [rows])
  const noStockCount = useMemo(() => rows.filter((r) => r.status === "no_stock").length, [rows])
  const inStockCount = useMemo(() => rows.filter((r) => r.current_stock > 0).length, [rows])
  const totalStock   = useMemo(() => rows.reduce((s, r) => s + r.current_stock, 0), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      const matchSearch =
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.sku ?? "").toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q)
      const matchFilter =
        activeFilter === "all" ||
        r.status === activeFilter
      return matchSearch && matchFilter
    })
  }, [rows, search, activeFilter])

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs text-zinc-400 mb-0.5">Всего на складе</p>
          <p className="text-xl font-bold text-zinc-900 tabular-nums">{totalStock.toLocaleString("ru")}</p>
          <p className="text-[11px] text-zinc-400 mt-0.5">стеблей / единиц</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs text-zinc-400 mb-0.5">Позиции</p>
          <p className="text-xl font-bold text-zinc-900 tabular-nums">{inStockCount}</p>
          <p className="text-[11px] text-zinc-400 mt-0.5">в наличии</p>
        </div>
        <div
          onClick={() => setActiveFilter(activeFilter === "low" ? "all" : "low")}
          className={`rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
            lowCount > 0
              ? activeFilter === "low"
                ? "border-amber-400 bg-amber-100"
                : "border-amber-200 bg-amber-50 hover:bg-amber-100"
              : "border-zinc-200 bg-white"
          }`}
        >
          <p className="text-xs text-zinc-400 mb-0.5">Низкий остаток</p>
          <p className={`text-xl font-bold tabular-nums ${lowCount > 0 ? "text-amber-700" : "text-zinc-400"}`}>
            {lowCount}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">позиций</p>
        </div>
        <div
          onClick={() => setActiveFilter(activeFilter === "aging" ? "all" : "aging")}
          className={`rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
            agingCount > 0
              ? activeFilter === "aging"
                ? "border-orange-400 bg-orange-100"
                : "border-orange-200 bg-orange-50 hover:bg-orange-100"
              : "border-zinc-200 bg-white"
          }`}
        >
          <p className="text-xs text-zinc-400 mb-0.5">Залежались</p>
          <p className={`text-xl font-bold tabular-nums ${agingCount > 0 ? "text-orange-700" : "text-zinc-400"}`}>
            {agingCount}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">{agingCount > 0 ? "≥ 7 дней" : "всё свежее"}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Filter tabs */}
        <div className="flex gap-1 overflow-x-auto">
          {FILTER_TABS.map((tab) => {
            const count =
              tab.key === "low" ? lowCount :
              tab.key === "aging" ? agingCount :
              tab.key === "no_stock" ? noStockCount :
              rows.length
            return (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors whitespace-nowrap font-medium ${
                  activeFilter === tab.key
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
                }`}
              >
                {tab.label}
                {tab.key !== "all" && count > 0 && (
                  <span className={`ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full ${
                    activeFilter === tab.key ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-400"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          <Input
            placeholder="Поиск по названию..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 w-52 border-zinc-200 text-sm"
          />
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-2">
        <Link
          href="/purchases/new"
          className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Оформить закупку
        </Link>
        <Link
          href="/purchases"
          className="flex items-center gap-1.5 border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <ShoppingBag className="h-3.5 w-3.5" />
          Все поставки
        </Link>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-10 w-10 text-zinc-200 mb-3" />
            <p className="text-sm font-medium text-zinc-500">Склад пуст</p>
            <p className="text-xs text-zinc-400 mt-1">
              Оформите{" "}
              <Link href="/purchases/new" className="text-rose-500 hover:underline">
                приход товара
              </Link>
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <XCircle className="h-8 w-8 text-zinc-200 mb-2" />
            <p className="text-sm text-zinc-500">Ничего не найдено</p>
            <button
              onClick={() => { setSearch(""); setActiveFilter("all") }}
              className="mt-2 text-xs text-rose-500 hover:underline"
            >
              Сбросить фильтры
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  Наименование
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden md:table-cell">
                  Категория
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  Остаток
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden lg:table-cell">
                  Закупочная
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden lg:table-cell">
                  Приход
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden sm:table-cell">
                  Дней
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  Статус
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const cfg = STATUS_CFG[r.status]
                const isLast = i === filtered.length - 1
                return (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/inventory/${r.id}`)}
                    className={`border-b border-zinc-50 hover:bg-rose-50/40 cursor-pointer transition-colors group ${isLast ? "border-0" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-zinc-800 group-hover:text-rose-600 transition-colors">
                        {r.name}
                      </span>
                      {r.sku && (
                        <p className="text-xs text-zinc-400 font-mono mt-0.5">{r.sku}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500 hidden md:table-cell">
                      {r.category}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold tabular-nums ${
                        r.status === "low" ? "text-amber-600" :
                        r.status === "no_stock" ? "text-zinc-400" :
                        "text-zinc-800"
                      }`}>
                        {r.current_stock}
                        <span className="text-xs font-normal text-zinc-400 ml-1">{r.unit}</span>
                      </span>
                      {r.min_stock != null && r.min_stock > 0 && r.status === "low" && (
                        <p className="text-[10px] text-zinc-400 mt-0.5 text-right">
                          мин {r.min_stock}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600 text-sm tabular-nums hidden lg:table-cell">
                      {r.oldest_cost_price != null
                        ? `₽${r.oldest_cost_price.toLocaleString("ru", { maximumFractionDigits: 0 })}`
                        : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-zinc-500 hidden lg:table-cell">
                      {r.oldest_arrived_at ? fmtDate(r.oldest_arrived_at) : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      {r.days_on_shelf !== null ? (
                        <span className={`text-xs tabular-nums ${
                          r.days_on_shelf >= 7 ? "text-orange-600 font-medium" : "text-zinc-400"
                        }`}>
                          {r.days_on_shelf}
                        </span>
                      ) : (
                        <span className="text-zinc-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-md ${cfg.cls}`}>
                        {cfg.label}
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

      {filtered.length > 0 && rows.length > 0 && (
        <p className="text-xs text-zinc-400 text-right">
          {filtered.length} из {rows.length} позиций
        </p>
      )}
    </div>
  )
}
