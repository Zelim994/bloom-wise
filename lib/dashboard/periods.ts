export type Period = "today" | "7d" | "month" | "custom"

export const VALID_PERIODS: Period[] = ["today", "7d", "month", "custom"]

export const PERIOD_LABEL: Record<Period, string> = {
  today:  "за сегодня",
  "7d":   "за 7 дней",
  month:  "за месяц",
  custom: "за период",
}

export function getPeriodDateRange(
  period: Period,
  today: Date,
  customFrom?: string,
  customTo?: string,
): { from: string | null; to: string | null } {
  const pad = (d: Date) => d.toISOString().split("T")[0]
  const tomorrow = new Date(today.getTime() + 86_400_000)

  if (period === "today")  return { from: pad(today), to: pad(tomorrow) }
  if (period === "7d") {
    return { from: pad(new Date(today.getTime() - 6 * 86_400_000)), to: pad(tomorrow) }
  }
  if (period === "month") {
    return { from: pad(new Date(today.getFullYear(), today.getMonth(), 1)), to: pad(tomorrow) }
  }
  if (period === "custom" && customFrom && customTo) {
    const toExclusive = pad(new Date(new Date(customTo + "T00:00:00").getTime() + 86_400_000))
    return { from: customFrom, to: toExclusive }
  }
  return { from: null, to: null }
}
