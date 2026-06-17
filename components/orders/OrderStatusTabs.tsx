import Link from "next/link"

const TABS = [
  { key: "all",        label: "Все",           href: "/orders" },
  { key: "new",        label: "Новые",         href: "/orders?status=new" },
  { key: "in_progress",label: "В работе",      href: "/orders?status=in_progress" },
  { key: "ready",      label: "Готовые",       href: "/orders?status=ready" },
  { key: "delivered",  label: "Выполненные",   href: "/orders?status=delivered" },
  { key: "cancelled",  label: "Отменённые",    href: "/orders?status=cancelled" },
]

type Props = {
  activeStatus: string
  counts: Record<string, number>
}

export function OrderStatusTabs({ activeStatus, counts }: Props) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0)

  return (
    <div className="flex gap-1 flex-wrap">
      {TABS.map((tab) => {
        const count = tab.key === "all" ? total : (counts[tab.key] ?? 0)
        const isActive = activeStatus === tab.key
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? "bg-zinc-900 text-white"
                : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
            }`}
          >
            {tab.label}
            <span className={`text-xs rounded-full px-1.5 py-0.5 ${
              isActive ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-500"
            }`}>
              {count}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
