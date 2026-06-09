import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export type OrderPreview = {
  id: string
  customer: string
  bouquet: string
  amount: string
  status: string
  time: string
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  new: { label: "Новый", className: "bg-blue-100 text-blue-700" },
  in_progress: { label: "В работе", className: "bg-amber-100 text-amber-700" },
  ready: { label: "Готов", className: "bg-emerald-100 text-emerald-700" },
  delivered: { label: "Выдан", className: "bg-zinc-100 text-zinc-600" },
}

export function RecentOrdersWidget({ orders }: { orders: OrderPreview[] }) {
  return (
    <Card className="border-zinc-200 shadow-none">
      <CardHeader className="px-5 py-4 pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-zinc-900">Заказы сегодня</CardTitle>
        <Button variant="ghost" size="sm" asChild className="h-7 text-xs text-rose-500 hover:text-rose-600 gap-1 px-2">
          <Link href="/orders">
            Все заказы <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="space-y-2">
          {orders.map((order) => {
            const status = STATUS_CONFIG[order.status] ?? { label: order.status, className: "bg-zinc-100 text-zinc-600" }
            return (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 transition-colors hover:border-zinc-200 hover:bg-white"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-zinc-400">{order.id}</span>
                  <div>
                    <p className="text-sm font-medium text-zinc-800">{order.customer}</p>
                    <p className="text-xs text-zinc-400">{order.bouquet}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">{order.time}</span>
                  <span className="text-sm font-semibold text-zinc-800">{order.amount}</span>
                  <Badge className={`text-xs px-2 py-0.5 rounded-md border-0 font-medium ${status.className}`}>
                    {status.label}
                  </Badge>
                </div>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
