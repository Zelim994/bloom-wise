"use client"

import { Scissors, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { BouquetItem } from "./BuilderLayout"

interface Props {
  items: BouquetItem[]
  onQuantityChange: (id: string, qty: number) => void
  onRemove: (id: string) => void
}

export function BouquetPanel({ items, onQuantityChange, onRemove }: Props) {
  const label =
    items.length === 0
      ? "Состав букета"
      : items.length === 1
      ? "1 позиция"
      : `${items.length} позиций`

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 py-3 border-b border-zinc-100">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">{label}</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center px-4">
            <Scissors className="h-8 w-8 text-zinc-200 mb-3" />
            <p className="text-sm text-zinc-400">Добавьте цветы из склада</p>
            <p className="text-xs text-zinc-300 mt-1">Нажмите «Добавить» рядом с позицией</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-50">
            {items.map((item) => {
              const lineTotal = item.quantity * item.unit_cost
              return (
                <div
                  key={item._id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 truncate">{item.name}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      ₽{item.unit_cost}/{item.unit}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      min={1}
                      max={item.current_stock}
                      value={item.quantity}
                      onChange={(e) => onQuantityChange(item._id, Number(e.target.value) || 1)}
                      className="w-14 h-8 text-center text-sm border-zinc-200 tabular-nums px-1"
                    />
                    <span className="text-xs text-zinc-400 w-5 shrink-0">{item.unit}</span>
                    <span className="text-sm font-semibold text-zinc-700 tabular-nums w-14 text-right shrink-0">
                      ₽{lineTotal.toLocaleString("ru")}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(item._id)}
                      className="text-zinc-300 hover:text-red-500 transition-colors ml-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
