"use client"

import { TrendingUp, TrendingDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Props {
  costPrice: number
  salePrice: string
  profit: number
  margin: number
  itemCount: number
  onChange: (v: string) => void
}

export function FinancePanel({ costPrice, salePrice, profit, margin, itemCount, onChange }: Props) {
  const salePriceNum = Number(salePrice) || 0
  const hasData = costPrice > 0 || salePriceNum > 0

  return (
    <div className="flex flex-col h-full bg-zinc-50/60">
      <div className="px-4 py-3 border-b border-zinc-100">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Финансы</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Cost price */}
        <div className="rounded-xl bg-white border border-zinc-100 px-4 py-3">
          <p className="text-[10px] text-zinc-400 uppercase tracking-wide font-semibold mb-1">
            Себестоимость
          </p>
          <p className="text-2xl font-bold text-zinc-800 tabular-nums">
            ₽{costPrice.toLocaleString("ru", { maximumFractionDigits: 0 })}
          </p>
          {itemCount > 0 && (
            <p className="text-xs text-zinc-400 mt-0.5">{itemCount} позиций</p>
          )}
        </div>

        {/* Sale price */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            Цена продажи, ₽
          </Label>
          <Input
            type="number"
            min={0}
            step={50}
            value={salePrice}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0"
            className="border-zinc-200 h-10 text-base font-semibold tabular-nums bg-white"
          />
        </div>

        {/* Profit block */}
        {salePriceNum > 0 && (
          <div
            className={`rounded-xl border px-4 py-3 ${
              profit >= 0
                ? "bg-emerald-50 border-emerald-100"
                : "bg-red-50 border-red-100"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Прибыль
              </p>
              {profit >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </div>
            <p
              className={`text-2xl font-bold tabular-nums ${
                profit >= 0 ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {profit >= 0 ? "+" : "−"}₽
              {Math.abs(profit).toLocaleString("ru", { maximumFractionDigits: 0 })}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  margin >= 40
                    ? "bg-emerald-400"
                    : margin >= 20
                    ? "bg-amber-400"
                    : "bg-red-400"
                }`}
              />
              <p
                className={`text-sm font-semibold tabular-nums ${
                  margin >= 40
                    ? "text-emerald-600"
                    : margin >= 20
                    ? "text-amber-600"
                    : "text-red-600"
                }`}
              >
                Маржа {margin.toFixed(1)}%
              </p>
            </div>
          </div>
        )}

        {/* Legend */}
        {hasData && (
          <div className="text-xs text-zinc-400 space-y-1 pt-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span>40%+ — хорошая маржа</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <span>20–40% — приемлемо</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
              <span>Ниже 20% — низкая</span>
            </div>
          </div>
        )}

        {!hasData && (
          <p className="text-xs text-zinc-400 text-center pt-6 leading-relaxed">
            Добавьте цветы в букет,
            <br />
            чтобы увидеть расчёт
          </p>
        )}
      </div>
    </div>
  )
}
