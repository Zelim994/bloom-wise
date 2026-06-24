"use client"

import { useState } from "react"
import { Wand2, ChevronDown, ChevronUp, AlertCircle } from "lucide-react"
import type { FlowerForBuilder, AISuggestion } from "@/types/builder"

// ─── Алгоритм подбора ────────────────────────────────────────────────────────

type SelectionError = "no_positions" | "budget_too_small" | null

function selectByBudget(
  flowers: FlowerForBuilder[],
  budget: number | null
): { suggestions: AISuggestion[]; error: SelectionError } {
  const eligible = flowers.filter(
    (f) => f.current_stock > 0 && f.sale_price !== null && f.sale_price > 0
  )

  if (eligible.length === 0) {
    return { suggestions: [], error: "no_positions" }
  }

  if (budget === null) {
    const suggestions: AISuggestion[] = eligible.map((f) => ({
      flower: f,
      quantity: 1,
      totalCost: f.unit_cost,
      totalSale: f.sale_price!,
    }))
    return { suggestions, error: null }
  }

  const sorted = [...eligible].sort((a, b) => a.sale_price! - b.sale_price!)

  const chosen = new Map<string, number>()
  let spent = 0

  let progress = true
  while (progress) {
    progress = false
    for (const flower of sorted) {
      const alreadyChosen = chosen.get(flower.id) ?? 0
      if (alreadyChosen >= flower.current_stock) continue
      if (spent + flower.sale_price! > budget) continue
      chosen.set(flower.id, alreadyChosen + 1)
      spent += flower.sale_price!
      progress = true
    }
  }

  if (chosen.size === 0) {
    return { suggestions: [], error: "budget_too_small" }
  }

  const suggestions: AISuggestion[] = []
  for (const [stockKey, qty] of chosen.entries()) {
    const flower = eligible.find((f) => f.id === stockKey)!
    suggestions.push({
      flower,
      quantity: qty,
      totalCost: +(qty * flower.unit_cost).toFixed(2),
      totalSale: +(qty * flower.sale_price!).toFixed(2),
    })
  }

  suggestions.sort((a, b) => a.flower.name.localeCompare(b.flower.name, "ru"))

  return { suggestions, error: null }
}

// ─── Компонент ───────────────────────────────────────────────────────────────

interface Props {
  flowers: FlowerForBuilder[]
  onApply: (suggestions: AISuggestion[]) => void
}

export function AISelectionPanel({ flowers, onApply }: Props) {
  const [open, setOpen] = useState(false)
  const [budget, setBudget] = useState("")
  const [suggestions, setSuggestions] = useState<AISuggestion[] | null>(null)
  const [selectionError, setSelectionError] = useState<SelectionError>(null)
  const [applied, setApplied] = useState(false)

  function handleSelect() {
    setApplied(false)
    const budgetNum = budget.trim() !== "" ? parseFloat(budget) : null
    const { suggestions: result, error } = selectByBudget(flowers, budgetNum)
    setSuggestions(result.length > 0 ? result : null)
    setSelectionError(error)
  }

  function handleApply() {
    if (!suggestions?.length) return
    onApply(suggestions)
    setApplied(true)
  }

  const totalSale = suggestions?.reduce((s, i) => s + i.totalSale, 0) ?? 0
  const totalCost = suggestions?.reduce((s, i) => s + i.totalCost, 0) ?? 0
  const totalProfit = totalSale - totalCost

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
            <p className="text-[11px] text-zinc-400">Состав по бюджету из доступного склада</p>
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

          {/* Результат */}
          {suggestions && suggestions.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                Предложенный состав
              </p>

              <div className="rounded-lg border border-zinc-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50 text-zinc-400">
                      <th className="px-3 py-2 text-left font-medium">Позиция</th>
                      <th className="px-3 py-2 text-right font-medium">Кол-во</th>
                      <th className="px-3 py-2 text-right font-medium">Цена</th>
                      <th className="px-3 py-2 text-right font-medium">Сумма</th>
                      <th className="px-3 py-2 text-right font-medium">Себест.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map((s, idx) => {
                      const variant = [s.flower.variety_size, s.flower.color_name]
                        .filter(Boolean)
                        .join(" · ")
                      return (
                        <tr
                          key={s.flower.id}
                          className={idx % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}
                        >
                          <td className="px-3 py-2 text-zinc-700">
                            {s.flower.name}
                            {variant && (
                              <span className="ml-1 text-zinc-400">{variant}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-600">
                            {s.quantity} {s.flower.unit}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-600">
                            ₽{s.flower.sale_price!.toLocaleString("ru")}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-zinc-800">
                            ₽{s.totalSale.toLocaleString("ru")}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-400">
                            ₽{s.totalCost.toLocaleString("ru")}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Итоги */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <p className="text-[10px] text-zinc-400 mb-0.5">Итого продажа</p>
                  <p className="text-sm font-semibold text-zinc-800">
                    ₽{totalSale.toLocaleString("ru")}
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <p className="text-[10px] text-zinc-400 mb-0.5">Себестоимость</p>
                  <p className="text-sm font-semibold text-zinc-700">
                    ₽{totalCost.toLocaleString("ru")}
                  </p>
                </div>
                <div
                  className={`rounded-lg border px-3 py-2 ${
                    totalProfit >= 0
                      ? "border-emerald-100 bg-emerald-50"
                      : "border-red-100 bg-red-50"
                  }`}
                >
                  <p className="text-[10px] text-zinc-400 mb-0.5">Прибыль</p>
                  <p
                    className={`text-sm font-semibold ${
                      totalProfit >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    ₽{totalProfit.toLocaleString("ru")}
                  </p>
                </div>
              </div>

              {/* Применить */}
              <button
                type="button"
                onClick={handleApply}
                disabled={applied}
                className={`w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  applied
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default"
                    : "bg-zinc-900 hover:bg-zinc-700 text-white"
                }`}
              >
                {applied ? "✓ Применено к букету" : "Применить к букету"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
