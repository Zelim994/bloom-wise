export const AGING_DAYS = 7

export function getAgingCutoffDate(now = new Date()) {
  const date = new Date(now)
  date.setDate(date.getDate() - AGING_DAYS)
  return date
}

export function toISODateOnly(date: Date) {
  return date.toISOString().split("T")[0]
}
