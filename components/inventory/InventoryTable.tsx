"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Package, Search, XCircle, ChevronRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import type { FlowerWithStock } from "@/app/actions/inventory"

const CATEGORIES = ["Все", "Срезка", "Зелень", "Упаковка", "Декор", "Аксессуары", "Горшечные"]

type StockFilter = "all" | "low"

function stockStatus(stock: number, min: number | null): "ok" | "low" {
  const minVal = min ?? 0
  if (minVal > 0 && stock <= minVal) return "low"
  return "ok"
}

const statusBadge = {
  ok:  { label: "В норме", cls: "bg-emerald-100 text-emerald-700" },
  low: { label: "Мало",    cls: "bg-amber-100 text-amber-700" },
}

interface Props {
  flowers: FlowerWithStock[]
}

export function InventoryTable({ flowers }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("Все")
  const [stockFilter, setStockFilter] = useState<StockFilter>("all")

  const filtered = useMemo(() => {
    return flowers.filter((f) => {
      const q = search.toLowerCase()
      const matchSearch = q === "" || f.name.toLowerCase().includes(q)
      const matchCategory = category === "Все" || f.category === category
      const matchStock =
        stockFilter === "all" ||
        stockStatus(f.current_stock, f.min_stock) === stockFilter
      return matchSearch && matchCategory && matchStock
    })
  }, [flowers, search, category, stockFilter])

  const lowCount = flowers.filter(
    (f) => stockStatus(f.current_stock, f.min_stock) === "low"
  ).length

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">
          <Package className="h-4 w-4 text-zinc-400" />
          <span className="font-medium">{flowers.length}</span>
          <span className="text-zinc-400">
            {flowers.length === 1 ? "позиция" : "позиций"} в наличии
          </span>
        </div>

        {lowCount > 0 && (
          <button
            onClick={() => setStockFilter(stockFilter === "low" ? "all" : "low")}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
              stockFilter === "low"
                ? "border-amber-400 bg-amber-100 text-amber-800 font-medium"
                : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {lowCount} мало
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <Input
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 w-52 border-zinc-200 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              category === cat
                ? "bg-zinc-900 text-white font-medium"
                : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
            }`}
          >
            {cat}
          </button>
        ))}
        {stockFilter !== "all" && (
          <button
            onClick={() => setStockFilter("all")}
            className="ml-2 px-3 py-1.5 text-sm rounded-lg bg-rose-100 text-rose-700 font-medium flex items-center gap-1"
          >
            <XCircle className="h-3 w-3" />
            Сбросить
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {flowers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-10 w-10 text-zinc-200 mb-3" />
            <p className="text-sm font-medium text-zinc-500">Склад пуст</p>
            <p className="text-xs text-zinc-400 mt-1 max-w-xs">
              Чтобы товар появился на складе — оформите{" "}
              <Link href="/purchases/new" className="text-rose-500 hover:underline">
                приход
              </Link>
              . Новые товары добавляются в{" "}
              <Link href="/catalog" className="text-rose-500 hover:underline">
                Каталог
              </Link>
              .
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-zinc-500">Ничего не найдено</p>
            <p className="text-xs text-zinc-400 mt-1">Попробуйте изменить фильтры или поиск</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  Наименование
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden sm:table-cell">
                  Категория
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  Остаток
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden md:table-cell">
                  Цена продажи
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  Статус
                </th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => {
                const s = stockStatus(f.current_stock, f.min_stock)
                const badge = statusBadge[s]
                return (
                  <tr
                    key={f.id}
                    onClick={() => router.push(`/inventory/${f.id}`)}
                    className={`border-b border-zinc-50 hover:bg-rose-50/40 cursor-pointer transition-colors group ${
                      i === filtered.length - 1 ? "border-0" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-zinc-800 group-hover:text-rose-600 transition-colors">
                        {f.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs hidden sm:table-cell">
                      {f.category}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold tabular-nums ${
                        s === "low" ? "text-amber-600" : "text-zinc-800"
                      }`}>
                        {f.current_stock}
                        <span className="text-xs font-normal text-zinc-400 ml-1">{f.unit}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-700 text-sm font-medium tabular-nums hidden md:table-cell">
                      {f.sale_price != null
                        ? `₽${f.sale_price.toLocaleString("ru", { maximumFractionDigits: 0 })}`
                        : <span className="text-zinc-400 font-normal text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge className={`text-xs px-2 py-0.5 border-0 rounded-md font-medium ${badge.cls}`}>
                        {badge.label}
                      </Badge>
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
          {filtered.length} из {flowers.length} позиций
        </p>
      )}
    </div>
  )
}
