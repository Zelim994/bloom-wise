import Link from "next/link"

export type Period = "today" | "7d" | "month" | "all"

export const VALID_PERIODS: Period[] = ["today", "7d", "month", "all"]

const TABS: { key: Period; label: string }[] = [
  { key: "today",  label: "Сегодня"   },
  { key: "7d",     label: "7 дней"    },
  { key: "month",  label: "Месяц"     },
  { key: "all",    label: "Всё время" },
]

export function DashboardPeriodTabs({ activePeriod }: { activePeriod: Period }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-zinc-400 mr-1.5">Период:</span>
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/?period=${tab.key}`}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            activePeriod === tab.key
              ? "bg-zinc-900 text-white"
              : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}

export function getPeriodDateRange(
  period: Period,
  today: Date
): { from: string | null; to: string | null } {
  const pad = (d: Date) => d.toISOString().split("T")[0]
  const tomorrow = new Date(today.getTime() + 86_400_000)

  if (period === "today") {
    return { from: pad(today), to: pad(tomorrow) }
  }
  if (period === "7d") {
    const start = new Date(today.getTime() - 6 * 86_400_000)
    return { from: pad(start), to: pad(tomorrow) }
  }
  if (period === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return { from: pad(start), to: pad(tomorrow) }
  }
  return { from: null, to: null }
}

export const PERIOD_LABEL: Record<Period, string> = {
  today: "за сегодня",
  "7d":  "за 7 дней",
  month: "за месяц",
  all:   "за всё время",
}
