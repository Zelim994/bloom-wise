import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export type StockAlert = {
  name: string
  stock: number
  min: number
  type: "low" | "out" | "aging"
  days?: number
}

export function StockAlertsWidget({ alerts }: { alerts: StockAlert[] }) {
  return (
    <Card className="border-zinc-200 shadow-none">
      <CardHeader className="px-5 py-4 pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-zinc-900">Склад — внимание</CardTitle>
        <Button variant="ghost" size="sm" asChild className="h-7 text-xs text-rose-500 hover:text-rose-600 gap-1 px-2">
          <Link href="/inventory">
            Склад <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="space-y-2">
          {alerts.map((item) => (
            <div
              key={item.name}
              className="flex items-start justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1 pr-2">
                <p className="text-xs font-medium text-zinc-800 truncate">{item.name}</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {item.type === "out"
                    ? "Нет в наличии"
                    : item.type === "aging"
                    ? `Залежался ${item.days} дней`
                    : `Остаток: ${item.stock} шт`}
                </p>
              </div>
              <Badge
                className={`text-[10px] px-1.5 py-0 border-0 shrink-0 ${
                  item.type === "out"
                    ? "bg-red-100 text-red-700"
                    : item.type === "aging"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {item.type === "out" ? "Нет" : item.type === "aging" ? "Залежался" : "Мало"}
              </Badge>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          asChild
          className="w-full mt-3 h-8 text-xs border-zinc-200 text-zinc-600"
        >
          <Link href="/purchases/new">+ Оформить закупку</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
