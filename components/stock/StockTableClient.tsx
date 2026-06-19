"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Search, Package, XCircle, ChevronRight, ShoppingCart, ShoppingBag } from "lucide-react"
import { Input } from "@/components/ui/input"

export type StockRow = {
  flower_id:         string
  variety_id:        string | null
  color_id:          string | null
  name:              string         // flower_name
  variety_name:      string | null
  variety_size:      string | null
  color_name:        string | null
  category:          string
  unit:              string
  min_stock:         number | null
  current_stock:     number
  oldest_arrived_at: string | null
  oldest_cost_price: number | null
  days_on_shelf:     number | null
  status:            "ok" | "low" | "aging" | "no_stock"
}

type StockFilter = "in_stock" | "low" | "aging" | "no_stock"

const FILTER_TABS: { key: StockFilter; label: string }[] = [
  { key: "in_stock", label: "В наличии"     },
  { key: "low",      label: "Низкий остаток" },
  { key: "aging",    label: "Залежались"     },
  { key: "no_stock", label: "Нет остатка"    },
]

const STATUS_SORT: Record<StockRow["status"], number> = {
  low: 0, aging: 1, ok: 2, no_stock: 3,
}

function variantLabel(r: StockRow): string {
  const parts = [r.variety_name, r.variety_size].filter(Boolean)
  return parts.join(" · ")
}

export function StockTableClient({ rows }: { rows: StockRow[] }) {
  const router = useRouter()
  const [search, setSearch]           = useState("")
  const [activeFilter, setActiveFilter] = useState<StockFilter>("in_stock")

  const lowCount     = useMemo(() => rows.filter((r) => r.status === "low").length,      [rows])
  const agingCount   = useMemo(() => rows.filter((r) => r.status === "aging").length,    [rows])
  const noStockCount = useMemo(() => rows.filter((r) => r.status === "no_stock").length, [rows])
  const inStockCount = useMemo(() => rows.filter((r) => r.current_stock > 0).length,     [rows])
  const totalStock   = useMemo(() => rows.reduce((s, r) => s + r.current_stock, 0),      [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    const matchesSearch = (r: StockRow) =>
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      (r.variety_name ?? "").toLowerCase().includes(q) ||
      (r.variety_size ?? "").toLowerCase().includes(q) ||
      (r.color_name   ?? "").toLowerCase().includes(q)

    const matchesFilter = (r: StockRow) => {
      if (activeFilter === "in_stock") return r.current_stock > 0
      if (activeFilter === "no_stock") return r.current_stock <= 0
      return r.status === activeFilter
    }

    const result = rows.filter((r) => matchesSearch(r) && matchesFilter(r))

    if (activeFilter === "in_stock") {
      result.sort((a, b) => {
        const sd = STATUS_SORT[a.status] - STATUS_SORT[b.status]
        return sd !== 0 ? sd : a.name.localeCompare(b.name, "ru")
      })
    }

    return result
  }, [rows, search, activeFilter])

  const filterCount = (key: StockFilter) => {
    if (key === "in_stock")  return inStockCount
    if (key === "low")       return lowCount
    if (key === "aging")     return agingCount
    if (key === "no_stock")  return noStockCount
    return 0
  }

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
          onClick={() => setActiveFilter(activeFilter === "low" ? "in_stock" : "low")}
          className={`rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
            lowCount > 0
              ? activeFilter === "low"
                ? "border-amber-400 bg-amber-100"
                : "border-amber-200 bg-amber-50 hover:bg-amber-100"
              : "border-zinc-200 bg-white"
          }`}
        >
          <p className="text-xs text-zinc-400 mb-0.5">Низкий остаток</p>
          <p className={`text-xl font-bold tabular-nums ${lowCount > 0 ? "text-amber-700" : "text-zinc-300"}`}>
            {lowCount}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">позиций</p>
        </div>
        <div
          onClick={() => setActiveFilter(activeFilter === "aging" ? "in_stock" : "aging")}
          className={`rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
            agingCount > 0
              ? activeFilter === "aging"
                ? "border-orange-400 bg-orange-100"
                : "border-orange-200 bg-orange-50 hover:bg-orange-100"
              : "border-zinc-200 bg-white"
          }`}
        >
          <p className="text-xs text-zinc-400 mb-0.5">Залежались</p>
          <p className={`text-xl font-bold tabular-nums ${agingCount > 0 ? "text-orange-700" : "text-zinc-300"}`}>
            {agingCount}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">{agingCount > 0 ? "≥ 7 дней" : "всё свежее"}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 overflow-x-auto">
          {FILTER_TABS.map((tab) => {
            const count    = filterCount(tab.key)
            const isActive = activeFilter === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors whitespace-nowrap font-medium ${
                  isActive
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
                }`}
              >
                {tab.label}
                {tab.key !== "in_stock" && count > 0 && (
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
            placeholder="Поиск по названию, варианту, цвету..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 w-64 border-zinc-200 text-sm"
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
            <p className="text-sm text-zinc-500">
              {activeFilter === "no_stock" ? "Позиций без остатка нет" : "Ничего не найдено"}
            </p>
            <button
              onClick={() => { setSearch(""); setActiveFilter("in_stock") }}
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
                  Позиция
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden md:table-cell">
                  Категория
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden sm:table-cell">
                  Вариант · размер
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden lg:table-cell">
                  Цвет
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  Остаток
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden sm:table-cell">
                  Статус
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const rowKey  = `${r.flower_id}|${r.variety_id ?? ""}|${r.color_id ?? ""}`
                const vLabel  = variantLabel(r)
                const isLow   = r.status === "low"
                const isAging = r.status === "aging"

                return (
                  <tr
                    key={rowKey}
                    onClick={() => router.push(`/inventory/${r.flower_id}`)}
                    className="border-b border-zinc-50 last:border-0 hover:bg-rose-50/40 cursor-pointer transition-colors group"
                  >
                    {/* Позиция */}
                    <td className="px-4 py-3">
                      <span className="font-medium text-zinc-800 group-hover:text-rose-600 transition-colors">
                        {r.name}
                      </span>
                      {/* Variant subtitle on mobile — hidden on sm+ where we have separate columns */}
                      {(vLabel || r.color_name) && (
                        <p className="text-xs text-zinc-400 mt-0.5 sm:hidden">
                          {[vLabel, r.color_name].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </td>

                    {/* Категория */}
                    <td className="px-4 py-3 text-xs text-zinc-500 hidden md:table-cell">
                      {r.category}
                    </td>

                    {/* Вариант · размер */}
                    <td className="px-4 py-3 text-xs text-zinc-600 hidden sm:table-cell">
                      {vLabel
                        ? <span className="font-medium text-zinc-700">{vLabel}</span>
                        : <span className="text-zinc-300">—</span>}
                    </td>

                    {/* Цвет */}
                    <td className="px-4 py-3 text-xs text-zinc-600 hidden lg:table-cell">
                      {r.color_name
                        ? r.color_name
                        : <span className="text-zinc-300">—</span>}
                    </td>

                    {/* Остаток */}
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold tabular-nums ${
                        isLow           ? "text-amber-600"  :
                        r.status === "no_stock" ? "text-zinc-400"  :
                        "text-zinc-800"
                      }`}>
                        {r.current_stock}
                        <span className="text-xs font-normal text-zinc-400 ml-1">{r.unit}</span>
                      </span>
                      {r.min_stock != null && r.min_stock > 0 && isLow && (
                        <p className="text-[10px] text-zinc-400 mt-0.5 text-right">
                          мин {r.min_stock}
                        </p>
                      )}
                    </td>

                    {/* Статус */}
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-md ${
                        r.status === "ok"       ? "bg-emerald-100 text-emerald-700" :
                        r.status === "low"      ? "bg-amber-100 text-amber-700"     :
                        r.status === "aging"    ? "bg-orange-100 text-orange-700"   :
                                                  "bg-red-100 text-red-500"
                      }`}>
                        {r.status === "ok"       ? "В норме"     :
                         r.status === "low"      ? "Мало"        :
                         r.status === "aging"    ? "Залежался"   :
                                                   "Нет остатка"}
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
          {filtered.length} из {activeFilter === "in_stock" ? inStockCount : filterCount(activeFilter)} позиций
        </p>
      )}
    </div>
  )
}
