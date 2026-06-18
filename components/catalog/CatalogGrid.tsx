"use client"

import { useMemo, useState } from "react"
import { Plus, Search, LayoutGrid, List, Flower, ImageOff, ChevronRight, PackageX } from "lucide-react"
import { CatalogFlowerForm } from "@/components/catalog/CatalogFlowerForm"
import type { FlowerWithDetails } from "@/app/actions/catalog"

// ── Constants ──────────────────────────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  flowers: FlowerWithDetails[]
}

export function CatalogGrid({ flowers }: Props) {
  const [search,         setSearch]         = useState("")
  const [activeCategory, setActiveCategory] = useState("Все")
  const [viewMode,       setViewMode]       = useState<ViewMode>("list")
  const [selected,       setSelected]       = useState<FlowerWithDetails | null>(null)
  const [sheetOpen,      setSheetOpen]      = useState(false)

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const noPhotoCount = useMemo(
    () => flowers.filter((f) => !f.primary_image_url).length,
    [flowers]
  )

  // ── Category counts ───────────────────────────────────────────────────────────
  const catCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const f of flowers) m[f.category] = (m[f.category] ?? 0) + 1
    return m
  }, [flowers])

  // ── Filtered list ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return flowers.filter((f) => {
      if (activeCategory !== "Все" && f.category !== activeCategory) return false
      if (q) {
        const nameMatch = f.name.toLowerCase().includes(q)
        const skuMatch  = (f.sku ?? "").toLowerCase().includes(q)
        const catMatch  = f.category.toLowerCase().includes(q)
        if (!nameMatch && !skuMatch && !catMatch) return false
      }
      return true
    })
  }, [flowers, activeCategory, search])

  function openFlower(f: FlowerWithDetails) { setSelected(f); setSheetOpen(true) }
  function openNew()                         { setSelected(null); setSheetOpen(true) }

  return (
    <>
      <div className="space-y-4">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Каталог товаров</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Список товаров для заказов, букетов и склада
            </p>
          </div>
          <button
            onClick={openNew}
            className="shrink-0 flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            Добавить товар
          </button>
        </div>

        {/* ── Stats strip ── */}
        <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm">
          <span className="text-zinc-500">
            Всего позиций:{" "}
            <span className="font-semibold text-zinc-800">{flowers.length}</span>
          </span>
          {noPhotoCount > 0 && (
            <>
              <span className="text-zinc-200">·</span>
              <span className="flex items-center gap-1.5 text-zinc-400">
                <ImageOff className="h-3.5 w-3.5" />
                Без фото:{" "}
                <span className="font-semibold text-zinc-600">{noPhotoCount}</span>
              </span>
            </>
          )}
        </div>

        {/* ── Category tabs ── */}
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => {
            const count    = cat === "Все" ? flowers.length : (catCounts[cat] ?? 0)
            const colors   = CATEGORY_COLORS[cat]
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

        {/* ── Search + view toggle ── */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию, SKU..."
              className="w-full pl-8 pr-3 h-9 rounded-lg border border-zinc-200 bg-white text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
            />
          </div>
          <div className="flex items-center rounded-lg border border-zinc-200 bg-white p-0.5 gap-0.5 ml-auto">
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
        </div>

        {/* ── Empty state ── */}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-zinc-200 bg-white">
            <PackageX className="h-10 w-10 text-zinc-200 mb-3" />
            <p className="text-sm font-medium text-zinc-500">
              {search ? "Ничего не найдено" : "В этой категории нет товаров"}
            </p>
            {!search ? (
              <button
                onClick={openNew}
                className="mt-4 text-sm text-rose-500 hover:text-rose-600 font-medium"
              >
                + Добавить первый товар
              </button>
            ) : (
              <button
                onClick={() => setSearch("")}
                className="mt-2 text-xs text-rose-500 hover:underline"
              >
                Сбросить поиск
              </button>
            )}
          </div>
        )}

        {/* ── Grid view ── */}
        {filtered.length > 0 && viewMode === "grid" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map((f) => {
              const colors   = CATEGORY_COLORS[f.category] ?? DEFAULT_COLORS
              const hasPhoto = !!f.primary_image_url
              return (
                <button
                  key={f.id}
                  onClick={() => openFlower(f)}
                  className="group text-left rounded-2xl border border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-md transition-all overflow-hidden"
                >
                  {/* Photo */}
                  <div className={`relative h-36 overflow-hidden border-b border-zinc-100 ${
                    hasPhoto ? "" : colors.placeholder
                  }`}>
                    {hasPhoto ? (
                      <img
                        src={f.primary_image_url!}
                        alt={f.name}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Flower className={`h-8 w-8 opacity-20 ${colors.text}`} />
                      </div>
                    )}
                    <span className={`absolute top-2.5 left-2.5 h-2 w-2 rounded-full ${colors.dot} shadow-sm`} />
                    {!hasPhoto && (
                      <span className="absolute bottom-2 right-2 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-zinc-900/60 text-white">
                        Нет фото
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-sm font-semibold text-zinc-800 leading-snug line-clamp-2 group-hover:text-rose-600 transition-colors min-h-[2.5rem]">
                      {f.name}
                    </p>
                    {f.sku && (
                      <p className="text-[11px] font-mono text-zinc-400 mt-0.5">{f.sku}</p>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-md ${colors.bg} ${colors.text}`}>
                        {f.category}
                      </span>
                      <span className="text-xs text-zinc-400">{f.unit}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* ── List view ── */}
        {filtered.length > 0 && viewMode === "list" && (
          <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide w-12" />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">Наименование</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden sm:table-cell">Категория</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden md:table-cell">Ед.</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((f, i) => {
                  const colors   = CATEGORY_COLORS[f.category] ?? DEFAULT_COLORS
                  const hasPhoto = !!f.primary_image_url
                  return (
                    <tr
                      key={f.id}
                      onClick={() => openFlower(f)}
                      className={`border-b border-zinc-50 hover:bg-rose-50/30 cursor-pointer transition-colors group ${
                        i === filtered.length - 1 ? "border-0" : ""
                      }`}
                    >
                      {/* Thumbnail */}
                      <td className="px-4 py-2.5">
                        <div className={`h-9 w-9 rounded-xl overflow-hidden shrink-0 border border-zinc-100 ${
                          hasPhoto ? "" : colors.placeholder
                        }`}>
                          {hasPhoto ? (
                            <img src={f.primary_image_url!} alt={f.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              <Flower className={`h-4 w-4 opacity-25 ${colors.text}`} />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Name + SKU + no-photo badge */}
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-zinc-800 group-hover:text-rose-600 transition-colors truncate max-w-[220px]">
                          {f.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {f.sku && (
                            <span className="text-[11px] font-mono text-zinc-400">{f.sku}</span>
                          )}
                          {!hasPhoto && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-500">
                              Нет фото
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-2.5 hidden sm:table-cell">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${colors.bg} ${colors.text}`}>
                          {f.category}
                        </span>
                      </td>

                      {/* Unit */}
                      <td className="px-4 py-2.5 text-right hidden md:table-cell">
                        <span className="text-xs text-zinc-400">{f.unit}</span>
                      </td>

                      {/* Arrow */}
                      <td className="px-3 py-2.5 text-zinc-300 group-hover:text-rose-400 transition-colors">
                        <ChevronRight className="h-4 w-4" />
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
            {filtered.length}
            {filtered.length !== flowers.length ? ` из ${flowers.length}` : ""}{" "}
            {flowers.length === 1 ? "позиция" : flowers.length <= 4 ? "позиции" : "позиций"}
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
