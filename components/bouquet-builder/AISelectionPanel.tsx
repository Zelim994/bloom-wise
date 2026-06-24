"use client"

import { useState } from "react"
import { Wand2, ChevronDown, ChevronUp, AlertCircle } from "lucide-react"
import type { FlowerForBuilder, AISuggestion } from "@/types/builder"

// ─── Классификация ролей ──────────────────────────────────────────────────────

type FlowerRole = "focal" | "filler" | "green" | "other"

function classifyRole(flower: FlowerForBuilder): FlowerRole {
  const text = `${flower.name} ${flower.category ?? ""}`.toLowerCase()
  if (/роза|пион|хризантем|гортензия|лилия|тюльпан|гербера|ирис|ранункул|нарцисс|фрезия/.test(text))
    return "focal"
  if (/гипсофила|кустовая|альстромерия|эустома|маттиола|статица|кермек/.test(text))
    return "filler"
  if (/зелен|эвкалипт|рускус|фисташка|папоротник|аспидистра|монстера/.test(text))
    return "green"
  return "other"
}

// ─── Алгоритм ─────────────────────────────────────────────────────────────────

type VariantConfig = {
  label: string
  description: string
  targetRatio: number
}

const VARIANT_CONFIGS: VariantConfig[] = [
  { label: "Экономный",          description: "С запасом, ~80% бюджета",      targetRatio: 0.80 },
  { label: "Сбалансированный",   description: "Красивый букет, ~90% бюджета", targetRatio: 0.90 },
  { label: "Ближе к бюджету",    description: "Максимум из наличия, ~98%",    targetRatio: 0.98 },
]

type VariantResult = {
  label: string
  description: string
  suggestions: AISuggestion[]
  totalSale: number
  totalCost: number
  profit: number
  budgetUsedPct: number
}

type SelectionError = "no_positions" | "budget_too_small" | null

// Строит один вариант подбора с заданным целевым процентом бюджета.
// Фаза 1 — диверсификация: берёт по 1 цветку каждой роли (focal → filler → green → other).
// Фаза 2 — жадное заполнение: добавляет дешевейшие позиции пока есть место до cap.
function buildVariant(
  eligible: FlowerForBuilder[],
  budget: number,
  config: VariantConfig
): AISuggestion[] | null {
  const cap = budget * config.targetRatio

  const byRole: Record<FlowerRole, FlowerForBuilder[]> = {
    focal: [], filler: [], green: [], other: [],
  }
  for (const f of eligible) {
    byRole[classifyRole(f)].push(f)
  }
  const roleOrder: FlowerRole[] = ["focal", "filler", "green", "other"]
  for (const role of roleOrder) {
    byRole[role].sort((a, b) => a.sale_price! - b.sale_price!)
  }

  const chosen = new Map<string, number>()
  let spent = 0

  // Фаза 1: по 1 цветку каждой доступной роли, самый дешёвый в роли
  for (const role of roleOrder) {
    for (const flower of byRole[role]) {
      if (spent + flower.sale_price! <= cap) {
        chosen.set(flower.id, 1)
        spent += flower.sale_price!
        break
      }
    }
  }

  // Фаза 2: жадное заполнение до cap самыми дешёвыми позициями
  const sortedAll = [...eligible].sort((a, b) => a.sale_price! - b.sale_price!)
  let progress = true
  while (progress) {
    progress = false
    for (const flower of sortedAll) {
      const qty = chosen.get(flower.id) ?? 0
      if (qty >= flower.current_stock) continue
      if (spent + flower.sale_price! > cap) continue
      chosen.set(flower.id, qty + 1)
      spent += flower.sale_price!
      progress = true
    }
  }

  if (chosen.size === 0) return null

  const suggestions: AISuggestion[] = []
  for (const [id, qty] of chosen.entries()) {
    const flower = eligible.find((f) => f.id === id)!
    suggestions.push({
      flower,
      quantity: qty,
      totalCost: +(qty * flower.unit_cost).toFixed(2),
      totalSale: +(qty * flower.sale_price!).toFixed(2),
    })
  }
  suggestions.sort((a, b) => a.flower.name.localeCompare(b.flower.name, "ru"))
  return suggestions
}

// Канонический ключ варианта для дедупликации.
// Сортируем по flower.id чтобы порядок не влиял на сравнение.
function variantKey(suggestions: AISuggestion[]): string {
  return [...suggestions]
    .sort((a, b) => a.flower.id.localeCompare(b.flower.id))
    .map(
      (s) =>
        `${s.flower.flower_id}:${s.flower.variety_id ?? ""}:${s.flower.color_id ?? ""}:${s.quantity}`
    )
    .join("|")
}

function buildAllVariants(
  flowers: FlowerForBuilder[],
  budget: number
): { variants: VariantResult[]; error: SelectionError } {
  const eligible = flowers.filter(
    (f) => f.current_stock > 0 && f.sale_price !== null && f.sale_price > 0
  )

  if (eligible.length === 0) {
    return { variants: [], error: "no_positions" }
  }

  const raw: VariantResult[] = []

  for (const config of VARIANT_CONFIGS) {
    const suggestions = buildVariant(eligible, budget, config)
    if (!suggestions) continue
    const totalSale = +suggestions.reduce((s, i) => s + i.totalSale, 0).toFixed(2)
    const totalCost = +suggestions.reduce((s, i) => s + i.totalCost, 0).toFixed(2)
    raw.push({
      label: config.label,
      description: config.description,
      suggestions,
      totalSale,
      totalCost,
      profit: +(totalSale - totalCost).toFixed(2),
      budgetUsedPct: Math.round((totalSale / budget) * 100),
    })
  }

  if (raw.length === 0) {
    return { variants: [], error: "budget_too_small" }
  }

  // Убираем варианты с одинаковым составом
  const seen = new Set<string>()
  const unique: VariantResult[] = []
  for (const r of raw) {
    const key = variantKey(r.suggestions)
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(r)
    }
  }

  // Если после дедупликации остался один вариант — переименовываем
  if (unique.length === 1) {
    unique[0] = {
      ...unique[0],
      label: "Оптимальный вариант",
      description: "",
    }
  }

  return { variants: unique, error: null }
}

// ─── Компонент ───────────────────────────────────────────────────────────────

interface Props {
  flowers: FlowerForBuilder[]
  onApply: (suggestions: AISuggestion[]) => void
}

export function AISelectionPanel({ flowers, onApply }: Props) {
  const [open, setOpen] = useState(false)
  const [budget, setBudget] = useState("")
  const [variants, setVariants] = useState<VariantResult[] | null>(null)
  const [selectionError, setSelectionError] = useState<SelectionError>(null)
  const [appliedIdx, setAppliedIdx] = useState<number | null>(null)

  function handleSelect() {
    setAppliedIdx(null)
    const budgetNum = budget.trim() !== "" ? parseFloat(budget) : null

    if (budgetNum === null || budgetNum <= 0) {
      setVariants(null)
      setSelectionError(null)
      return
    }

    const { variants: result, error } = buildAllVariants(flowers, budgetNum)
    setVariants(result.length > 0 ? result : null)
    setSelectionError(error)
  }

  const budgetNum = budget.trim() !== "" ? parseFloat(budget) : null
  const noBudget = budgetNum === null || budgetNum <= 0

  return (
    <div className="mt-3 rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* Заголовок-аккордеон */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500">
            <Wand2 className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-800">ИИ подбирает букет из наличия</p>
            <p className="text-[11px] text-zinc-400">
              {variants && variants.length === 1
                ? "Оптимальный состав из доступного склада"
                : "Варианты по бюджету из доступного склада"}
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-zinc-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
        )}
      </button>

      {open && (
        <div className="border-t border-zinc-100 px-4 pb-4 pt-3 space-y-3">
          {/* Бюджет + кнопка */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                Бюджет клиента, ₽
              </label>
              <input
                type="number"
                min={0}
                placeholder="Например, 3000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSelect()}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleSelect}
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
              >
                <Wand2 className="h-4 w-4" />
                Подобрать состав
              </button>
            </div>
          </div>

          {/* Подсказка: бюджет не указан */}
          {noBudget && !variants && !selectionError && (
            <p className="text-xs text-zinc-400">
              Укажите бюджет клиента, чтобы подобрать состав
            </p>
          )}

          {/* Ошибки */}
          {selectionError === "no_positions" && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              Нет доступных позиций с ценой продажи
            </div>
          )}
          {selectionError === "budget_too_small" && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              Не удалось подобрать состав под этот бюджет
            </div>
          )}

          {/* ── Карточки вариантов ───────────────────────────────────── */}
          {variants && variants.length > 0 && (
            <div className="space-y-3">
              {variants.length === 1 && (
                <p className="text-xs text-zinc-400">
                  Для текущего бюджета и остатков найден один оптимальный состав.
                </p>
              )}
              {variants.map((v, idx) => {
                const isApplied = appliedIdx === idx
                return (
                  <div
                    key={v.label}
                    className={`rounded-xl border overflow-hidden transition-colors ${
                      isApplied
                        ? "border-emerald-300 bg-emerald-50/40"
                        : "border-zinc-200 bg-white"
                    }`}
                  >
                    {/* Шапка карточки */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100">
                      <div>
                        <span className="text-sm font-semibold text-zinc-800">{v.label}</span>
                        <span className="ml-2 text-[11px] text-zinc-400">{v.description}</span>
                      </div>
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
                          v.budgetUsedPct >= 95
                            ? "bg-violet-50 text-violet-600"
                            : v.budgetUsedPct >= 85
                            ? "bg-indigo-50 text-indigo-600"
                            : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {v.budgetUsedPct}% бюджета
                      </span>
                    </div>

                    {/* Состав */}
                    <div className="px-4 py-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-zinc-400">
                            <th className="pb-1 text-left font-medium">Позиция</th>
                            <th className="pb-1 text-right font-medium">Кол-во</th>
                            <th className="pb-1 text-right font-medium">Цена</th>
                            <th className="pb-1 text-right font-medium">Сумма</th>
                            <th className="pb-1 text-right font-medium">Себест.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {v.suggestions.map((s, i) => {
                            const variant = [s.flower.variety_size, s.flower.color_name]
                              .filter(Boolean)
                              .join(" · ")
                            return (
                              <tr
                                key={s.flower.id}
                                className={i % 2 === 0 ? "" : "bg-zinc-50/50"}
                              >
                                <td className="py-1 text-zinc-700">
                                  {s.flower.name}
                                  {variant && (
                                    <span className="ml-1 text-zinc-400">{variant}</span>
                                  )}
                                </td>
                                <td className="py-1 text-right text-zinc-600">
                                  {s.quantity} {s.flower.unit}
                                </td>
                                <td className="py-1 text-right text-zinc-500">
                                  ₽{s.flower.sale_price!.toLocaleString("ru")}
                                </td>
                                <td className="py-1 text-right font-medium text-zinc-800">
                                  ₽{s.totalSale.toLocaleString("ru")}
                                </td>
                                <td className="py-1 text-right text-zinc-400">
                                  ₽{s.totalCost.toLocaleString("ru")}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Итоги + кнопка */}
                    <div className="px-4 pb-3 pt-1 flex items-center gap-3">
                      <div className="flex-1 grid grid-cols-3 gap-2">
                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5">
                          <p className="text-[10px] text-zinc-400">Продажа</p>
                          <p className="text-xs font-semibold text-zinc-800">
                            ₽{v.totalSale.toLocaleString("ru")}
                          </p>
                        </div>
                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5">
                          <p className="text-[10px] text-zinc-400">Себест.</p>
                          <p className="text-xs font-semibold text-zinc-700">
                            ₽{v.totalCost.toLocaleString("ru")}
                          </p>
                        </div>
                        <div
                          className={`rounded-lg border px-2.5 py-1.5 ${
                            v.profit >= 0
                              ? "border-emerald-100 bg-emerald-50"
                              : "border-red-100 bg-red-50"
                          }`}
                        >
                          <p className="text-[10px] text-zinc-400">Прибыль</p>
                          <p
                            className={`text-xs font-semibold ${
                              v.profit >= 0 ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            ₽{v.profit.toLocaleString("ru")}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onApply(v.suggestions)
                          setAppliedIdx(idx)
                        }}
                        disabled={isApplied}
                        className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                          isApplied
                            ? "bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-default"
                            : "bg-zinc-900 hover:bg-zinc-700 text-white"
                        }`}
                      >
                        {isApplied ? "✓ Применено" : "Применить"}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
