"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarDays } from "lucide-react"
import type { Period } from "@/lib/dashboard/periods"

export type { Period }

const QUICK_TABS: { key: Period; label: string }[] = [
  { key: "today", label: "Сегодня" },
  { key: "7d",    label: "Неделя"  },
  { key: "month", label: "Месяц"   },
]

export function DashboardPeriodTabs({
  activePeriod,
  activeFrom,
  activeTo,
}: {
  activePeriod: Period
  activeFrom?: string
  activeTo?: string
}) {
  const router = useRouter()
  const [open, setOpen]   = useState(false)
  const [from, setFrom]   = useState(activeFrom ?? "")
  const [to, setTo]       = useState(activeTo   ?? "")

  const applyCustom = () => {
    if (!from || !to || from > to) return
    setOpen(false)
    router.push(`/?period=custom&from=${from}&to=${to}`)
  }

  const isCustomActive = activePeriod === "custom"

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-400 mr-0.5">Период:</span>

      {QUICK_TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => router.push(`/?period=${tab.key}`)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            activePeriod === tab.key
              ? "bg-zinc-900 text-white"
              : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
          }`}
        >
          {tab.label}
        </button>
      ))}

      {/* Кнопка-триггер для произвольного диапазона */}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Выбрать период"
          title="Выбрать период"
          className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
            isCustomActive
              ? "bg-zinc-900 text-white"
              : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
          }`}
        >
          <CalendarDays className="h-4 w-4" />
        </button>

        {open && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOpen(false)}
            />
            {/* Popover */}
            <div className="absolute top-full left-0 mt-2 z-20 bg-white border border-zinc-200 rounded-xl shadow-lg p-4 min-w-[260px]">
              <p className="text-xs font-semibold text-zinc-500 mb-3">Выберите период</p>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 w-5">От</span>
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="flex-1 text-sm border border-zinc-200 rounded-lg px-2 py-1.5 text-zinc-700 bg-white focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 w-5">До</span>
                  <input
                    type="date"
                    value={to}
                    min={from || undefined}
                    onChange={(e) => setTo(e.target.value)}
                    className="flex-1 text-sm border border-zinc-200 rounded-lg px-2 py-1.5 text-zinc-700 bg-white focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
                  />
                </div>
              </div>
              <button
                onClick={applyCustom}
                disabled={!from || !to || from > to}
                className="mt-4 w-full py-2 rounded-lg text-sm font-medium bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Применить
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
