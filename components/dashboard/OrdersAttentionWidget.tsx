import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/services/organizationService"
import { AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react"

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
  urgency: "warn" | "info"
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
      urgency: "warn",
    },
    {
      label: "Нужно получить оплату",
      count: needPayment,
      href: "/orders?payment=open",
      urgency: "warn",
    },
    {
      label: "Готовые к выдаче",
      count: readyToGive,
      href: "/orders?status=ready",
      urgency: "info",
    },
    {
      label: "Проверить возврат склада",
      count: needStockReturn,
      href: "/orders?status=cancelled&stock=written_off",
      urgency: "warn",
    },
  ]

  const totalIssues = needStockWriteOff + needPayment + needStockReturn

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-900">Заказы требуют внимания</h3>
        <Link
          href="/orders"
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-rose-500 transition-colors"
        >
          Открыть заказы
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {totalIssues === 0 && readyToGive === 0 ? (
        <div className="flex items-center gap-2 text-emerald-600 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Всё чисто — нет срочных задач</span>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-zinc-50 transition-colors group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {item.count > 0 ? (
                  <AlertTriangle
                    className={`h-4 w-4 shrink-0 ${
                      item.urgency === "warn" ? "text-amber-400" : "text-blue-400"
                    }`}
                  />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                )}
                <span className="text-sm text-zinc-600 truncate">{item.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                {item.count > 0 ? (
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      item.urgency === "warn" ? "text-amber-600" : "text-blue-600"
                    }`}
                  >
                    {item.count}
                  </span>
                ) : (
                  <span className="text-xs text-zinc-400">—</span>
                )}
                <ArrowRight className="h-3.5 w-3.5 text-zinc-300 group-hover:text-zinc-400 transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
