import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type EmptyStateProps = {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-6 px-2 text-center", className)}>
      {icon}
      <p className="text-sm font-medium text-zinc-700">{title}</p>
      {description && <p className="text-xs text-zinc-400 mt-0.5">{description}</p>}
      {action}
    </div>
  )
}
