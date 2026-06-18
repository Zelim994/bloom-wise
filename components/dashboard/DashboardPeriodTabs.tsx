"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { Period } from "@/lib/dashboard/periods"

export type { Period }

const QUICK_TABS: { key: Period; label: string }[] = [
  { key: "today", label: "Сегодня" },
  { key: "7d",    label: "7 дней"  },
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
  const [from, setFrom] = useState(activeFrom ?? "")
  const [to, setTo]     = useState(activeTo   ?? "")

  const applyCustom = () => {
    if (!from || !to || from > to) return
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

      <span className="text-zinc-200 select-none">|</span>

      <div className={`flex items-center gap-1.5 rounded-lg transition-colors ${
        isCustomActive ? "ring-2 ring-zinc-800 px-2 py-1" : ""
      }`}>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="text-sm border border-zinc-200 rounded-lg px-2 py-1.5 text-zinc-700 bg-white focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
        />
        <span className="text-xs text-zinc-400">—</span>
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
          className="text-sm border border-zinc-200 rounded-lg px-2 py-1.5 text-zinc-700 bg-white focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
        />
        <button
          onClick={applyCustom}
          disabled={!from || !to || from > to}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          Применить
        </button>
      </div>
    </div>
  )
}
