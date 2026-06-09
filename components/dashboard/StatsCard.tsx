import { Card, CardContent } from "@/components/ui/card"
import type { LucideIcon } from "lucide-react"

export type StatItem = {
  label: string
  value: string
  trend: string
  up: boolean
  icon: LucideIcon
  color: string
  bg: string
}

export function StatsCard({ label, value, trend, up, icon: Icon, color, bg }: StatItem) {
  return (
    <Card className="border-zinc-200 shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-zinc-500 mb-1">{label}</p>
            <p className="text-xl font-bold text-zinc-900">{value}</p>
            <p className={`text-xs mt-1 ${up ? "text-emerald-600" : "text-rose-600"}`}>
              {trend}
            </p>
          </div>
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
