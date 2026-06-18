"use client"

import { useRouter } from "next/navigation"
import type { CalendarPeriod } from "@/lib/calendar/periods"

export type { CalendarPeriod }

const TABS: { key: CalendarPeriod; label: string }[] = [
  { key: "today",    label: "Сегодня" },
  { key: "tomorrow", label: "Завтра"  },
  { key: "7d",       label: "7 дней"  },
  { key: "month",    label: "Месяц"   },
]

export function CalendarPeriodTabs({ active }: { active: CalendarPeriod }) {
  const router = useRouter()
  return (
    <div className="flex gap-1 flex-wrap">
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => router.push(`/calendar?period=${t.key}`)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            active === t.key
              ? "bg-zinc-900 text-white"
              : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
