"use client"

import { useState } from "react"
import { Plus, Search, LayoutGrid, List } from "lucide-react"
import { CatalogFlowerForm } from "@/components/catalog/CatalogFlowerForm"
import type { FlowerWithDetails } from "@/app/actions/catalog"

const CATEGORIES = ["Все", "Срезка", "Зелень", "Упаковка", "Декор", "Аксессуары", "Горшечные"]

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; dot: string; placeholder: string }> = {
  Срезка:     { bg: "bg-rose-50",    border: "border-rose-200",    text: "text-rose-700",    dot: "bg-rose-400",    placeholder: "bg-gradient-to-br from-rose-50 to-rose-100" },
  Зелень:     { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-400", placeholder: "bg-gradient-to-br from-emerald-50 to-emerald-100" },
  Упаковка:   { bg: "bg-sky-50",     border: "border-sky-200",     text: "text-sky-700",     dot: "bg-sky-400",     placeholder: "bg-gradient-to-br from-sky-50 to-sky-100" },
  Декор:      { bg: "bg-violet-50",  border: "border-violet-200",  text: "text-violet-700",  dot: "bg-violet-400",  placeholder: "bg-gradient-to-br from-violet-50 to-violet-100" },
  Аксессуары: { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700",   dot: "bg-amber-400",   placeholder: "bg-gradient-to-br from-amber-50 to-amber-100" },
  Горшечные:  { bg: "bg-teal-50",    border: "border-teal-200",    text: "text-teal-700",    dot: "bg-teal-400",    placeholder: "bg-gradient-to-br from-teal-50 to-teal-100" },
}

const DEFAULT_COLORS = {
  bg: "bg-zinc-50", border: "border-zinc-200", text: "text-zinc-600",
  dot: "bg-zinc-300", placeholder: "bg-gradient-to-br from-zinc-50 to-zinc-100",
}

type ViewMode = "grid" | "list"

interface Props {
  flowers: FlowerWithDetails[]
}

export function CatalogGrid({ flowers }: Props) {
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState("Все")
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [selected, setSelected] = useState<FlowerWithDetails | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const filtered = flowers.filter((f) => {
    const matchCategory = activeCategory === "Все" || f.category === activeCategory
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      f.name.toLowerCase().includes(q) ||
      f.varieties.some((v) => v.name.toLowerCase().includes(q)) ||
      f.colors.some((c) => c.name.toLowerCase().includes(q))
    return matchCategory && matchSearch
  })

  function openFlower(f: FlowerWithDetails) {
    setSelected(f)
    setSheetOpen(true)
  }

  function openNew() {
    setSelected(null)
    setSheetOpen(true)
  }

  const counts: Record<string, number> = {}
  for (const f of flowers) {
    counts[f.category] = (counts[f.category] ?? 0) + 1
  }

  return (
    <>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию, сорту, цвету..."
              className="w-full pl-9 pr-3 h-9 rounded-lg border border-zinc-200 bg-white text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
            />
          </div>

          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-zinc-200 bg-white p-0.5 gap-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
                viewMode === "grid" ? "bg-zinc-900 text-white" : "text-zinc-400 hover:text-zinc-700"
              }`}
              title="Карточки"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
                viewMode === "list" ? "bg-zinc-900 text-white" : "text-zinc-400 hover:text-zinc-700"
              }`}
              title="Список"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={openNew}
            className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            Добавить товар
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => {
            const count = cat === "Все" ? flowers.length : (counts[cat] ?? 0)
            const colors = CATEGORY_COLORS[cat]
            const isActive = activeCategory === cat
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                  isActive
                    ? colors
                      ? `${colors.bg} ${colors.border} ${colors.text}`
                      : "bg-zinc-900 text-white border-zinc-900"
                    : "bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50"
                }`}
              >
                {colors && isActive && (
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${colors.dot}`} />
                )}
                {cat}
                <span className={`text-xs px-1.5 py-0.5 rounded-full tabular-nums ${
                  isActive
                    ? colors ? "bg-white/70 text-inherit" : "bg-white/20"
                    : "bg-zinc-100 text-zinc-400"
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-zinc-200 bg-white">
            <div className="h-12 w-12 rounded-full bg-zinc-100 mb-3" />
            <p className="text-sm font-medium text-zinc-500">
              {search ? "Ничего не найдено" : "В этой категории нет товаров"}
            </p>
            {!search && (
              <button
                onClick={openNew}
                className="mt-4 text-sm text-rose-500 hover:text-rose-600 font-medium transition-colors"
              >
                + Добавить первый товар
              </button>
            )}
          </div>
        )}

        {/* Grid view */}
        {filtered.length > 0 && viewMode === "grid" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map((f) => {
              const colors = CATEGORY_COLORS[f.category] ?? DEFAULT_COLORS
              const firstVariety = f.varieties[0]
              const firstColor = f.colors[0]
              return (
                <button
                  key={f.id}
                  onClick={() => openFlower(f)}
                  className="group text-left rounded-xl border border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-md transition-all overflow-hidden"
                >
                  {/* Photo */}
                  <div className={`relative h-32 overflow-hidden border-b border-zinc-100 ${
                    f.primary_image_url ? "" : colors.placeholder
                  }`}>
                    {f.primary_image_url ? (
                      <img
                        src={f.primary_image_url}
                        alt={f.name}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="h-full w-full flex items-end justify-end p-2.5">
                        <span className={`text-3xl font-bold opacity-[0.12] select-none ${colors.text}`}>
                          {f.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <span className={`absolute top-2 left-2 h-2 w-2 rounded-full ${colors.dot}`} />
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-sm font-medium text-zinc-800 leading-snug line-clamp-2 min-h-[2.5rem]">
                      {f.name}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      {firstVariety && (
                        <span className="text-xs text-zinc-400 truncate max-w-full">{firstVariety.name}{firstVariety.size ? ` · ${firstVariety.size}` : ""}</span>
                      )}
                      {firstVariety && firstColor && (
                        <span className="text-xs text-zinc-300">·</span>
                      )}
                      {firstColor && (
                        <span className="text-xs text-zinc-400 truncate">{firstColor.name}</span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-md ${colors.bg} ${colors.text}`}>
                        {f.category}
                      </span>
                      <span className="text-xs text-zinc-300">{f.unit}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* List view */}
        {filtered.length > 0 && viewMode === "list" && (
          <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide w-12" />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">Наименование</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden sm:table-cell">Категория</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden md:table-cell">Сорта</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden lg:table-cell">Цвета</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Ед.</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f, i) => {
                  const colors = CATEGORY_COLORS[f.category] ?? DEFAULT_COLORS
                  return (
                    <tr
                      key={f.id}
                      onClick={() => openFlower(f)}
                      className={`border-b border-zinc-50 hover:bg-zinc-50/80 cursor-pointer transition-colors ${
                        i === filtered.length - 1 ? "border-0" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <div className={`h-9 w-9 rounded-lg overflow-hidden shrink-0 ${
                          f.primary_image_url ? "" : colors.placeholder
                        } border border-zinc-100`}>
                          {f.primary_image_url ? (
                            <img src={f.primary_image_url} alt={f.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              <span className={`text-sm font-bold opacity-25 ${colors.text}`}>
                                {f.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-zinc-800 truncate max-w-[200px]">{f.name}</p>
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${colors.bg} ${colors.text}`}>
                          {f.category}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-400 text-xs hidden md:table-cell max-w-[160px] truncate">
                        {f.varieties.length > 0
                          ? f.varieties.slice(0, 2).map((v) => v.name).join(", ") + (f.varieties.length > 2 ? ` +${f.varieties.length - 2}` : "")
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-400 text-xs hidden lg:table-cell">
                        {f.colors.length > 0
                          ? f.colors.slice(0, 3).map((c) => c.name).join(", ") + (f.colors.length > 3 ? ` +${f.colors.length - 3}` : "")
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-400 text-xs">
                        {f.unit}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <p className="text-xs text-zinc-400 text-right">
            {filtered.length} {filtered.length === 1 ? "товар" : filtered.length <= 4 ? "товара" : "товаров"}
            {activeCategory !== "Все" && ` в разделе «${activeCategory}»`}
          </p>
        )}
      </div>

      <CatalogFlowerForm
        open={sheetOpen}
        flower={selected}
        onClose={() => setSheetOpen(false)}
      />
    </>
  )
}
