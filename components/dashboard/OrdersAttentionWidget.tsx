import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/services/organizationService"

type AttentionRow = {
  status: string
  payment_status: string | null
  stock_written_off: boolean
  stock_returned: boolean
}

type Item = {
  label: string
  count: number
  href: string
  emoji: string
  urgency: "warn" | "info"
}

function plural(n: number): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m100 >= 11 && m100 <= 19) return "заказов"
  if (m10 === 1) return "заказ"
  if (m10 >= 2 && m10 <= 4) return "заказа"
  return "заказов"
}

export async function OrdersAttentionWidget() {
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

  const items: Item[] = [
    {
      label: "Нужно списать склад",
      count: needStockWriteOff,
      href: "/orders?stock=not_written_off",
      emoji: "📦",
      urgency: "warn",
    },
    {
      label: "Получить оплату",
      count: needPayment,
      href: "/orders?payment=open",
      emoji: "💰",
      urgency: "warn",
    },
    {
      label: "Готовые к выдаче",
      count: readyToGive,
      href: "/orders?status=ready",
      emoji: "🎁",
      urgency: "info",
    },
    {
      label: "Проверить возврат склада",
      count: needStockReturn,
      href: "/orders?status=cancelled&stock=written_off",
      emoji: "↩️",
      urgency: "warn",
    },
  ]

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
            const countColor =
              item.urgency === "warn" ? "text-amber-700" : "text-sky-700"
            const linkColor =
              item.urgency === "warn"
                ? "text-amber-500 hover:text-amber-700"
                : "text-sky-500 hover:text-sky-700"

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`block rounded-lg border p-3 transition-colors ${active}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="text-base leading-none mt-0.5 shrink-0">{item.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-800 leading-snug">{item.label}</p>
                      <p className={`text-xs font-semibold mt-0.5 ${countColor}`}>
                        {item.count} {plural(item.count)}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium shrink-0 mt-0.5 transition-colors ${linkColor}`}>
                    Открыть →
                  </span>
                </div>
              </Link>
            )
          }

          return (
            <div
              key={item.label}
              className="rounded-lg border border-zinc-100 bg-zinc-50 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-base leading-none opacity-30 shrink-0">{item.emoji}</span>
                <div>
                  <p className="text-xs font-medium text-zinc-400 leading-snug">{item.label}</p>
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
