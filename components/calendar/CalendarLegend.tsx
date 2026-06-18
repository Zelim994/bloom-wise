"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

const STATUSES = [
  { dot: "bg-blue-400",    label: "Новый"    },
  { dot: "bg-amber-400",   label: "В работе" },
  { dot: "bg-emerald-400", label: "Готов"    },
  { dot: "bg-zinc-300",    label: "Выполнен" },
]

export function CalendarLegend() {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors select-none"
      >
        {open ? "Скрыть легенду" : "Легенда"}
        {open ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {open && (
        <div className="mt-2 flex items-center gap-3 flex-wrap text-xs text-zinc-500">
          {STATUSES.map(({ dot, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
              {label}
            </div>
          ))}
          <div className="h-3 w-px bg-zinc-200 mx-0.5 hidden sm:block" />
          <div className="flex items-center gap-1">
            <span className="px-1 rounded bg-red-100 text-red-500 text-[10px] font-medium leading-tight">
              ₽
            </span>
            Не оплачено
          </div>
          <div className="flex items-center gap-1">
            <span className="px-1 rounded bg-orange-100 text-orange-500 text-[10px] font-medium leading-tight">
              Склад
            </span>
            не списан
          </div>
        </div>
      )}
    </div>
  )
}
