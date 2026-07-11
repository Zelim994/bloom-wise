import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  CalendarDays,
  CreditCard,
  Flower,
  Hourglass,
  LayoutGrid,
  NotebookText,
  Package,
  Plus,
  Settings,
  ShoppingBag,
  Trash2,
  Truck,
  Users,
  AlertTriangle,
  TrendingUp,
  Library,
  Sparkles,
} from "lucide-react"

export const AppIcons = {
  home: LayoutGrid,
  newOrder: Plus,
  order: ShoppingBag,
  bouquet: Flower,
  calendar: CalendarDays,
  customer: Users,
  catalog: Library,
  inventory: Package,
  purchase: Truck,
  writeoff: Trash2,
  recipe: NotebookText,
  report: BarChart3,
  settings: Settings,
  payment: CreditCard,
  stale: Hourglass,
  warning: AlertTriangle,
  growth: TrendingUp,
  ai: Sparkles,
} satisfies Record<string, LucideIcon>

export type AppIconName = keyof typeof AppIcons
