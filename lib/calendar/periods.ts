export type CalendarPeriod = "today" | "tomorrow" | "7d" | "month"

export const VALID_CALENDAR_PERIODS: CalendarPeriod[] = ["today", "tomorrow", "7d", "month"]

export type CalendarFilter = "all" | "new" | "in_progress" | "ready" | "unpaid" | "stock"

export const VALID_CALENDAR_FILTERS: CalendarFilter[] = [
  "all", "new", "in_progress", "ready", "unpaid", "stock",
]
