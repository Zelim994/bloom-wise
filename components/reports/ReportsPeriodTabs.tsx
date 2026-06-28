"use client"

import { useRouter } from "next/navigation"
import type { Period } from "@/lib/dashboard/periods"

const TABS: { key: Period; label: string }[] = [
  { key: "today",      label: "Сегодня"        },
  { key: "7d",         label: "7 дней"          },
  { key: "month",      label: "Этот месяц"      },
  { key: "last_month", label: "Прошлый месяц"   },
]

export function ReportsPeriodTabs({ currentPeriod }: { currentPeriod: Period }) {
  const router = useRouter()

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => router.push(`/reports?period=${tab.key}`)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            currentPeriod === tab.key
              ? "bg-zinc-900 text-white"
              : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
