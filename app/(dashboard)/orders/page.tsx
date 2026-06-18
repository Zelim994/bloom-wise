import Link from "next/link"
import { Plus } from "lucide-react"
import { getOrders } from "@/app/actions/orders"
import { OrderStatusTabs } from "@/components/orders/OrderStatusTabs"
import { OrdersTable } from "@/components/orders/OrdersTable"

const VALID_STATUSES = ["new", "in_progress", "ready", "delivered", "cancelled"]
const VALID_STOCK: string[] = ["all", "not_written_off", "written_off", "returned"]
const VALID_PAYMENT: string[] = ["all", "unpaid", "partial", "paid", "open"]

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; stock?: string; payment?: string }>
}) {
  const { status: rawStatus, stock: rawStock, payment: rawPayment } = await searchParams
  const activeStatus = VALID_STATUSES.includes(rawStatus ?? "") ? (rawStatus as string) : "all"
  const initialStock = VALID_STOCK.includes(rawStock ?? "") ? rawStock as string : undefined
  const initialPayment = VALID_PAYMENT.includes(rawPayment ?? "") ? rawPayment as string : undefined

  const orders = await getOrders()

  const counts: Record<string, number> = {}
  for (const o of orders) {
    counts[o.status] = (counts[o.status] ?? 0) + 1
  }

  const displayed = activeStatus === "all" ? orders : orders.filter((o) => o.status === activeStatus)
  const activeCount = orders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Заказы</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {activeCount > 0 ? `${activeCount} активных` : "Нет активных заказов"}
          </p>
        </div>
        <Link
          href="/orders/new"
          className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          Новый заказ
        </Link>
      </div>

      <OrderStatusTabs activeStatus={activeStatus} counts={counts} />

      <OrdersTable
        orders={displayed}
        activeStatus={activeStatus}
        initialStockFilter={initialStock as "all" | "not_written_off" | "written_off" | "returned" | undefined}
        initialPaymentFilter={initialPayment as "all" | "unpaid" | "partial" | "paid" | "open" | undefined}
      />
    </div>
  )
}
