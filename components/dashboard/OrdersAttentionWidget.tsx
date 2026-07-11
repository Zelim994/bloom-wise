import { Gift, RotateCcw, type LucideIcon } from "lucide-react"
import { AppIcons } from "@/lib/icons"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/services/organizationService"

type AttentionRow = {
  status: string
  payment_status: string | null
  stock_written_off: boolean
  stock_returned: boolean
}

export type OrderReminderItem = {
  key: string
  title: string
  count: number
  href: string
  icon: LucideIcon
  urgency: "warn" | "info"
}

export function plural(n: number): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m100 >= 11 && m100 <= 19) return "заказов"
  if (m10 === 1) return "заказ"
  if (m10 >= 2 && m10 <= 4) return "заказа"
  return "заказов"
}

export async function getOrderReminderItems(): Promise<{
  hasOrders: boolean
  items: OrderReminderItem[]
}> {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)

  let rows: AttentionRow[] = []
  if (orgId) {
    const { data } = await supabase
      .from("orders")
      .select("status, payment_status, stock_written_off, stock_returned")
      .eq("organization_id", orgId)
    rows = (data ?? []) as AttentionRow[]
  }

  if (rows.length === 0) {
    return { hasOrders: false, items: [] }
  }

  const needStockWriteOff = rows.filter(
    (o) => o.status !== "cancelled" && !o.stock_written_off
  ).length

  const needPayment = rows.filter(
    (o) =>
      o.status !== "cancelled" &&
      (o.payment_status === "unpaid" || o.payment_status === "partial")
  ).length

  const readyToGive = rows.filter((o) => o.status === "ready").length

  const needStockReturn = rows.filter(
    (o) => o.status === "cancelled" && o.stock_written_off && !o.stock_returned
  ).length

  const items: OrderReminderItem[] = [
    {
      key: "write_off",
      title: "Нужно списать склад",
      count: needStockWriteOff,
      href: "/orders?stock=not_written_off",
      icon: AppIcons.writeoff,
      urgency: "warn",
    },
    {
      key: "payment",
      title: "Получить оплату",
      count: needPayment,
      href: "/orders?payment=open",
      icon: AppIcons.payment,
      urgency: "warn",
    },
    {
      key: "ready",
      title: "Готовые к выдаче",
      count: readyToGive,
      href: "/orders?status=ready",
      icon: Gift,
      urgency: "info",
    },
    {
      key: "return",
      title: "Проверить возврат склада",
      count: needStockReturn,
      href: "/orders?status=cancelled&stock=written_off",
      icon: RotateCcw,
      urgency: "warn",
    },
  ]

  return { hasOrders: true, items }
}
