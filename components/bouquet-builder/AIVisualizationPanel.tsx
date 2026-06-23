"use client"

import { useState } from "react"
import { Sparkles, ImageOff, Check, Download, RefreshCw, AlertCircle, Loader2, ChevronDown, ChevronUp, Copy } from "lucide-react"
import type { BouquetItem } from "@/types/builder"
import { generateBouquetImage } from "@/app/actions/ai"

// ─── Types ────────────────────────────────────────────────────────────────────

type VisualizationParams = {
  style: string
  shape: string
  palette: string
  wrapping: string
  occasion: string
  comment: string
}

// ─── Prompt builder (for preview display) ────────────────────────────────────

function buildPrompt(items: BouquetItem[], p: VisualizationParams): string {
  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0)

  const lines = items.map((item) => {
    const parts: string[] = [item.name]
    if (item.variety_name && !item.name.includes(item.variety_name)) {
      parts.push(item.variety_name)
    }
    if (item.variety_size) parts.push(`размер ${item.variety_size}`)
    if (item.color_name) parts.push(`цвет ${item.color_name}`)
    return `- ${item.quantity} видимых цветочных головок: ${parts.join(", ")}`
  })

  const sections: string[] = [
    "ФОТОРЕАЛИЗМ:",
    "Создай максимально реалистичную фотографию настоящего букета, как будто его собрал профессиональный флорист и сфотографировал на камеру в цветочном салоне.",
    "- живые натуральные цветы, не пластиковые, не мультяшные, не 3D-рендер;",
    "- реалистичные лепестки с естественными изгибами, фактурой и небольшими несовершенствами;",
    "- естественные зелёные листья и стебли;",
    "- профессиональная флористическая сборка;",
    "- мягкий естественный свет;",
    "- реалистичная глубина резкости;",
    "- чистый светлый фон;",
    "- коммерческое фото для отправки клиенту в WhatsApp;",
    "- без людей, без рук, без текста, без логотипов, без лишних предметов.\n",
    `СОСТАВ БУКЕТА (${totalQuantity} цветочных головок):`,
    lines.join("\n"),
    `\nОбщее количество цветочных головок в букете: ${totalQuantity}.`,
    `Постарайся визуально показать около ${totalQuantity} хорошо различимых цветочных головок.`,
    "Не уменьшая количество, собери букет так, чтобы большая часть головок была видна сверху и спереди.",
    `Если точное количество сложно показать из-за плотной композиции, сохрани визуальное ощущение полного букета из ${totalQuantity} цветов: букет должен выглядеть объёмным, плотным и соответствовать указанному количеству.\n`,
    "СТИЛЬ И ФОРМА:",
    `Стиль: ${p.style}`,
    `Форма: ${p.shape}`,
    `Повод: ${p.occasion}\n`,
    "УПАКОВКА:",
    `Используй только выбранный тип упаковки: ${p.wrapping}.`,
    `Если выбрана матовая бумага — упаковка должна быть однотонной или спокойной, без ярких разноцветных листов, если пользователь отдельно не указал яркие цвета.\n`,
  ]
  if (p.palette) {
    sections.push(
      `ЦВЕТОВАЯ ГАММА:\nСоблюдай указанную цветовую гамму: ${p.palette}.\nНе добавляй контрастные цвета, если они не указаны пользователем.\n`
    )
  }
  if (p.comment) {
    sections.push(`ПОЖЕЛАНИЕ КЛИЕНТА:\n${p.comment}\n`)
  }
  sections.push(
    "НЕ ДОБАВЛЯТЬ:",
    "- другие виды цветов;",
    "- другие цвета цветов;",
    "- декоративные цветы, которых нет в составе;",
    "- искусственные украшения, если они не указаны;",
    "- ягоды, сухоцветы, гипсофилу, зелень или аксессуары, если пользователь не выбрал их."
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
  const [promptVisible, setPromptVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [promptUsed, setPromptUsed] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  const hasItems = items.length > 0

  const set =
    (field: keyof VisualizationParams) =>
    (
      e: React.ChangeEvent<
        HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement
      >
    ) => setParams((p) => ({ ...p, [field]: e.target.value }))

  const handlePrepare = () => {
    setPrompt(buildPrompt(items, params))
    setPromptVisible(false)
    setImageUrl(null)
    setPromptUsed(null)
    setGenError(null)
  }

  const handleCopyPrompt = async () => {
    if (!prompt) return
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleGenerate = async () => {
    if (!prompt) return
    setIsGenerating(true)
    setGenError(null)
    setImageUrl(null)
    setPromptUsed(null)

    const result = await generateBouquetImage({
      prompt,
      selectedItems: items.map((i) => ({
        flower_id: i.flower_id,
        variety_id: i.variety_id ?? null,
        color_id: i.color_id ?? null,
        name: i.name,
        variety_name: i.variety_name ?? null,
        variety_size: i.variety_size ?? null,
        color_name: i.color_name ?? null,
        quantity: i.quantity,
      })),
      visualizationParams: {
        style: params.style,
        shape: params.shape,
        palette: params.palette || undefined,
        wrapping: params.wrapping,
        occasion: params.occasion,
        comment: params.comment || undefined,
      },
    })

    setIsGenerating(false)

    if (result.success) {
      setImageUrl(result.imageUrl)
      setPromptUsed(result.promptUsed)
    } else {
      setGenError(result.error)
    }
  }

  const handleGenerateAnother = () => {
    setImageUrl(null)
    setPromptUsed(null)
    setGenError(null)
    handleGenerate()
  }

  // Financial summary
  const costPrice = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0)
  const salePrice = items.reduce((s, i) => s + i.quantity * (i.sale_price ?? 0), 0)
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
            Подготовьте описание букета и сгенерируйте изображение
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
              <span className="text-sm font-medium text-zinc-700">
                AI-запрос подготовлен. Можно сгенерировать изображение.
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Left: composition + params */}
              <div className="space-y-3">
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
                          <p className={`font-semibold ${margin >= 30 ? "text-emerald-600" : "text-amber-600"}`}>
                            {margin.toFixed(0)}%
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

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

              {/* Right: prompt controls + image area */}
              <div className="space-y-3">
                <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-3.5">
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">
                      AI-запрос
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleCopyPrompt}
                        className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-700 transition-colors px-2 py-1 rounded hover:bg-zinc-100"
                      >
                        {copied ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {copied ? "Скопировано" : "Скопировать"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPromptVisible((v) => !v)}
                        className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-700 transition-colors px-2 py-1 rounded hover:bg-zinc-100"
                      >
                        {promptVisible ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                        {promptVisible ? "Скрыть" : "Показать prompt"}
                      </button>
                    </div>
                  </div>

                  {/* Compact params summary */}
                  {(() => {
                    const totalQuantity = items.reduce((s, i) => s + i.quantity, 0)
                    const tags = [
                      `${totalQuantity} цветков`,
                      params.style,
                      params.shape,
                      params.wrapping,
                      params.occasion,
                      params.palette || null,
                    ].filter(Boolean) as string[]
                    return (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-md bg-white border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-600 font-medium"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )
                  })()}

                  {/* Collapsible full prompt */}
                  {promptVisible && (
                    <pre className="mt-3 pt-3 border-t border-zinc-200 text-xs text-zinc-600 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">
                      {prompt}
                    </pre>
                  )}
                </div>

                {/* Image area */}
                {!imageUrl && !isGenerating && !genError && (
                  <div className="rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50 flex flex-col items-center justify-center py-10 px-4 text-center">
                    <ImageOff className="h-9 w-9 text-zinc-300 mb-2.5" />
                    <p className="text-sm font-medium text-zinc-500">
                      Здесь появится AI-визуализация букета
                    </p>
                  </div>
                )}

                {isGenerating && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 flex flex-col items-center justify-center py-12 px-4 text-center">
                    <Loader2 className="h-8 w-8 text-violet-400 animate-spin mb-3" />
                    <p className="text-sm font-medium text-zinc-600">Генерируем визуализацию…</p>
                    <p className="text-xs text-zinc-400 mt-1">обычно занимает 10–20 секунд</p>
                  </div>
                )}

                {genError && (
                  <div className="rounded-lg border border-red-100 bg-red-50 p-4 flex gap-3">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{genError}</p>
                  </div>
                )}

                {imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <div className="space-y-1.5">
                    <div className="rounded-lg overflow-hidden border border-zinc-200">
                      <img
                        src={imageUrl}
                        alt="AI-визуализация букета"
                        className="w-full h-auto"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-400 text-center leading-relaxed">
                      AI-визуализация примерная. Точный состав и количество цветов указаны в списке букета.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {!imageUrl ? (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Генерируем…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Сгенерировать изображение
                    </>
                  )}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleGenerateAnother}
                    disabled={isGenerating}
                    className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Сгенерировать ещё вариант
                  </button>

                  <a
                    href={imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Открыть изображение
                  </a>
                </>
              )}

              {/* Save to history — disabled, Этап 3 */}
              <button
                type="button"
                disabled
                title="Будет доступно в Этапе 3"
                className="flex items-center gap-2 border border-zinc-100 bg-zinc-50 text-zinc-400 text-sm font-medium px-4 py-2 rounded-lg cursor-not-allowed"
              >
                Сохранить в историю
                <span className="text-[10px] bg-zinc-200 text-zinc-500 rounded px-1.5 py-0.5 font-semibold">
                  Этап 3
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
