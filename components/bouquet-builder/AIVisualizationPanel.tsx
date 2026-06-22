"use client"

import { useState } from "react"
import { Sparkles, ImageOff, Check } from "lucide-react"
import type { BouquetItem } from "@/types/builder"

// ─── Types ────────────────────────────────────────────────────────────────────

type VisualizationParams = {
  style: string
  shape: string
  palette: string
  wrapping: string
  occasion: string
  comment: string
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(items: BouquetItem[], p: VisualizationParams): string {
  const lines = items.map((item) => {
    const parts: string[] = [item.name]
    if (item.variety_name && !item.name.includes(item.variety_name)) {
      parts.push(item.variety_name)
    }
    if (item.variety_size) parts.push(`размер ${item.variety_size}`)
    if (item.color_name) parts.push(`цвет ${item.color_name}`)
    return `- ${parts.join(", ")} — ${item.quantity} шт`
  })

  const sections: string[] = [
    "Создай реалистичную визуализацию букета для цветочного салона.\n",
    `Состав букета:\n${lines.join("\n")}\n`,
    `Стиль: ${p.style}`,
    `Форма: ${p.shape}`,
  ]
  if (p.palette) sections.push(`Цветовая гамма: ${p.palette}`)
  sections.push(`Упаковка: ${p.wrapping}`)
  sections.push(`Повод: ${p.occasion}`)
  if (p.comment) sections.push(`Пожелание клиента: ${p.comment}`)
  sections.push(
    "\nТребования к изображению:\nреалистичный букет, профессиональная флористика, чистый светлый фон, без текста на изображении, без людей, без лишних предметов."
  )

  return sections.join("\n")
}

// ─── Shared field styles ──────────────────────────────────────────────────────

const selectCls =
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent transition"
const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent transition"

function Field({
  label,
  children,
  className = "",
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AIVisualizationPanel({ items }: { items: BouquetItem[] }) {
  const [params, setParams] = useState<VisualizationParams>({
    style: "Нежный",
    shape: "Круглый",
    palette: "",
    wrapping: "Матовая бумага",
    occasion: "День рождения",
    comment: "",
  })
  const [prompt, setPrompt] = useState<string | null>(null)

  const hasItems = items.length > 0

  const set =
    (field: keyof VisualizationParams) =>
    (
      e: React.ChangeEvent<
        HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement
      >
    ) => setParams((p) => ({ ...p, [field]: e.target.value }))

  const handlePrepare = () => setPrompt(buildPrompt(items, params))

  // Financial summary from item prices
  const costPrice = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0)
  const salePrice = items.reduce(
    (s, i) => s + i.quantity * (i.sale_price ?? 0),
    0
  )
  const profit = salePrice - costPrice
  const margin = salePrice > 0 ? (profit / salePrice) * 100 : 0

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 shrink-0">
          <Sparkles className="h-4 w-4 text-violet-500" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-zinc-800">AI-визуализация</h2>
          <p className="text-xs text-zinc-400">
            Подготовьте описание букета для будущей генерации изображения
          </p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Form grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Стиль букета">
            <select value={params.style} onChange={set("style")} className={selectCls}>
              {["Нежный", "Премиальный", "Минималистичный", "Яркий", "Свадебный"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>

          <Field label="Форма букета">
            <select value={params.shape} onChange={set("shape")} className={selectCls}>
              {["Круглый", "Раскидистый", "Каскадный", "Компактный"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>

          <Field label="Упаковка">
            <select value={params.wrapping} onChange={set("wrapping")} className={selectCls}>
              {["Матовая бумага", "Плёнка", "Корейская упаковка", "Без упаковки"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>

          <Field label="Повод">
            <select value={params.occasion} onChange={set("occasion")} className={selectCls}>
              {["День рождения", "Свадьба", "Свидание", "Благодарность", "Без повода"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>

          <Field label="Цветовая гамма" className="col-span-2 sm:col-span-2">
            <input
              type="text"
              value={params.palette}
              onChange={set("palette")}
              placeholder="Например: пастельные тона, без красного"
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Пожелание клиента">
          <textarea
            value={params.comment}
            onChange={set("comment")}
            rows={2}
            placeholder="Светлый воздушный букет без ярких цветов, побольше зелени..."
            className={`${inputCls} resize-none`}
          />
        </Field>

        {/* CTA row */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handlePrepare}
            disabled={!hasItems}
            className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Подготовить визуализацию
          </button>
          {!hasItems && (
            <p className="text-xs text-zinc-400">Сначала выберите цветы для букета</p>
          )}
        </div>

        {/* ── Result card ─────────────────────────────────────────────────── */}
        {prompt !== null && (
          <div className="space-y-4 pt-4 border-t border-zinc-100">
            {/* Status badge */}
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 shrink-0">
                <Check className="h-3 w-3 text-emerald-600" strokeWidth={3} />
              </span>
              <span className="text-sm font-medium text-zinc-700">AI-запрос подготовлен</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Left column: composition + params */}
              <div className="space-y-3">
                {/* Composition */}
                <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-3.5">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                    Состав букета
                  </p>
                  <ul className="space-y-1.5">
                    {items.map((item) => {
                      const variant = [item.variety_size, item.color_name]
                        .filter(Boolean)
                        .join(" · ")
                      return (
                        <li key={item._id} className="flex justify-between text-xs">
                          <span className="text-zinc-700">
                            {item.name}
                            {variant && (
                              <span className="text-zinc-400 ml-1">· {variant}</span>
                            )}
                          </span>
                          <span className="font-semibold text-zinc-800 ml-3 shrink-0">
                            {item.quantity} {item.unit}
                          </span>
                        </li>
                      )
                    })}
                  </ul>

                  {/* Financial summary */}
                  {(costPrice > 0 || salePrice > 0) && (
                    <div className="mt-3 pt-2.5 border-t border-zinc-200 grid grid-cols-3 gap-2 text-xs">
                      {costPrice > 0 && (
                        <div>
                          <p className="text-zinc-400">Себестоимость</p>
                          <p className="font-semibold text-zinc-800">
                            ₽{costPrice.toLocaleString("ru")}
                          </p>
                        </div>
                      )}
                      {salePrice > 0 && (
                        <div>
                          <p className="text-zinc-400">Продажа</p>
                          <p className="font-semibold text-zinc-800">
                            ₽{salePrice.toLocaleString("ru")}
                          </p>
                        </div>
                      )}
                      {salePrice > 0 && costPrice > 0 && (
                        <div>
                          <p className="text-zinc-400">Маржа</p>
                          <p
                            className={`font-semibold ${
                              margin >= 30 ? "text-emerald-600" : "text-amber-600"
                            }`}
                          >
                            {margin.toFixed(0)}%
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Visualization params */}
                <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-3.5">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                    Параметры визуализации
                  </p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    {(
                      [
                        ["Стиль", params.style],
                        ["Форма", params.shape],
                        ["Упаковка", params.wrapping],
                        ["Повод", params.occasion],
                        params.palette ? ["Гамма", params.palette] : null,
                        params.comment ? ["Пожелание", params.comment] : null,
                      ] as ([string, string] | null)[]
                    )
                      .filter((x): x is [string, string] => x !== null)
                      .map(([k, v]) => (
                        <div key={k} className="flex gap-1.5 min-w-0">
                          <dt className="text-zinc-400 shrink-0">{k}:</dt>
                          <dd className="text-zinc-700 font-medium truncate">{v}</dd>
                        </div>
                      ))}
                  </dl>
                </div>
              </div>

              {/* Right column: prompt text + placeholder */}
              <div className="space-y-3">
                {/* Prompt */}
                <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-3.5">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                    Текст запроса
                  </p>
                  <pre className="text-xs text-zinc-600 whitespace-pre-wrap font-sans leading-relaxed">
                    {prompt}
                  </pre>
                </div>

                {/* Image placeholder */}
                <div className="rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50 flex flex-col items-center justify-center py-10 px-4 text-center">
                  <ImageOff className="h-9 w-9 text-zinc-300 mb-2.5" />
                  <p className="text-sm font-medium text-zinc-500">
                    Здесь появится AI-визуализация букета
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">на следующем этапе</p>
                </div>

                {/* Disabled generate button */}
                <button
                  type="button"
                  disabled
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-400 text-sm font-medium px-4 py-2.5 cursor-not-allowed"
                >
                  <Sparkles className="h-4 w-4" />
                  Сгенерировать изображение — скоро
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
