import { AGING_DAYS } from "@/lib/inventory/aging"

export type InventoryStatus = "ok" | "low" | "aging" | "no_stock"

export type StockAlert = {
  name: string
  stock: number
  min: number
  type: "low" | "out" | "aging"
  days?: number
}

export const DEFAULT_LOW_THRESHOLD = 5

export function getInventoryStatus(
  stock: number,
  minStock: number | null | undefined,
  daysOnShelf: number | null
): InventoryStatus {
  if (stock <= 0) return "no_stock"

  const threshold = minStock && minStock > 0 ? minStock : DEFAULT_LOW_THRESHOLD
  if (stock <= threshold) return "low"

  if (daysOnShelf !== null && daysOnShelf >= AGING_DAYS) return "aging"

  return "ok"
}
