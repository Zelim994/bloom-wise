import Link from "next/link"
import { Package, Banknote, Gift, RotateCcw, ShoppingBag, type LucideIcon } from "lucide-react"
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
      icon: Package,
      urgency: "warn",
    },
    {
      key: "payment",
      title: "Получить оплату",
      count: needPayment,
      href: "/orders?payment=open",
      icon: Banknote,
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

export async function OrdersAttentionWidget() {
  const { hasOrders, items } = await getOrderReminderItems()

  if (!hasOrders) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          Напоминания
        </h3>
        <div className="flex flex-col items-center justify-center py-6 px-2 text-center">
          <ShoppingBag className="h-8 w-8 text-zinc-300 mb-2" />
          <p className="text-sm font-medium text-zinc-700">Заказов пока нет</p>
          <p className="text-xs text-zinc-400 mt-0.5">
            Создайте первый заказ, чтобы видеть последние продажи и напоминания.
          </p>
          <Link
            href="/orders/new"
            className="mt-3 inline-flex items-center justify-center rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3 py-2 transition-colors"
          >
            Создать заказ
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
        Напоминания
      </h3>

      <div className="space-y-2">
        {items.map((item) => {
          if (item.count > 0) {
            const active =
              item.urgency === "warn"
                ? "border-amber-200 bg-amber-50 hover:bg-amber-100"
                : "border-sky-200 bg-sky-50 hover:bg-sky-100"
            const iconColor =
              item.urgency === "warn" ? "text-amber-500" : "text-sky-500"
            const countColor =
              item.urgency === "warn" ? "text-amber-700" : "text-sky-700"
            const linkColor =
              item.urgency === "warn" ? "text-amber-400" : "text-sky-400"

            return (
              <Link
                key={item.key}
                href={item.href}
                className={`block rounded-lg border p-3 transition-colors ${active}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <item.icon className={`h-4 w-4 shrink-0 mt-0.5 ${iconColor}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-800 leading-snug">{item.title}</p>
                      <p className={`text-xs font-semibold mt-0.5 ${countColor}`}>
                        {item.count} {plural(item.count)}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium shrink-0 mt-0.5 ${linkColor}`}>
                    →
                  </span>
                </div>
              </Link>
            )
          }

          return (
            <div
              key={item.key}
              className="rounded-lg border border-zinc-100 bg-zinc-50 p-3"
            >
              <div className="flex items-center gap-2.5">
                <item.icon className="h-4 w-4 shrink-0 text-zinc-300" />
                <div>
                  <p className="text-xs font-medium text-zinc-400 leading-snug">{item.title}</p>
                  <p className="text-xs text-emerald-500 mt-0.5">Всё чисто</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
