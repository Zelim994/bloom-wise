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
    <Card className="rounded-[var(--radius-card)] border border-[var(--border)] shadow-[var(--shadow-card)]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-1">{label}</p>
            <p className="text-xl font-bold text-[var(--text-primary)]">{value}</p>
            <p className={`text-xs mt-1 ${up ? "text-[var(--sage-text)]" : "text-[var(--warn-text)]"}`}>
              {trend}
            </p>
          </div>
          <div className={`flex h-9 w-9 items-center justify-center rounded-[var(--radius-chip)] ${bg}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
