"use client"

import { useState, useMemo } from "react"
import { Search, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { FlowerForBuilder, BouquetItem } from "./BuilderLayout"

const CATEGORIES = ["Все", "Срезка", "Зелень", "Упаковка", "Декор", "Аксессуары", "Горшечные"]

interface Props {
  flowers: FlowerForBuilder[]
  items: BouquetItem[]
  onAdd: (flower: FlowerForBuilder) => void
}

export function StockPanel({ flowers, items, onAdd }: Props) {
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("Все")

  const itemCountMap = new Map(items.map((i) => [i.flower_id, i.quantity]))

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return flowers.filter((f) => {
      const matchSearch = q === "" || f.name.toLowerCase().includes(q)
      const matchCat = category === "Все" || f.category === category
      return matchSearch && matchCat
    })
  }, [flowers, search, category])

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 py-3 border-b border-zinc-100 space-y-2.5">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
          Склад · {flowers.length} позиций
        </p>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <Input
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm border-zinc-200"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
                category === cat
                  ? "bg-zinc-800 text-white font-medium"
                  : "text-zinc-500 hover:bg-zinc-100"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-zinc-50">
        {filtered.length === 0 ? (
          <p className="text-sm text-zinc-400 text-center py-10">Ничего не найдено</p>
        ) : (
          filtered.map((f) => {
            const inBouquet = itemCountMap.get(f.id) ?? 0
            return (
              <div
                key={f.id}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-50/60 transition-colors"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <p className="text-sm font-medium text-zinc-800 truncate">{f.name}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {f.current_stock} {f.unit} · себ. ₽{f.unit_cost}
                    {f.sale_price != null && f.sale_price > 0 && (
                      <span className="text-emerald-600"> · прод. ₽{f.sale_price}</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(f)}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-all shrink-0 ${
                    inBouquet > 0
                      ? "bg-rose-100 text-rose-700 hover:bg-rose-200"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  <Plus className="h-3 w-3" />
                  {inBouquet > 0 ? `×${inBouquet}` : "Добавить"}
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
