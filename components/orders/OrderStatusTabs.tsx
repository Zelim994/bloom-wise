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
                ? "bg-[var(--sidebar-active)] text-[var(--text-on-dark)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
            }`}
          >
            {tab.label}
            <span className={`text-xs rounded-full px-1.5 py-0.5 ${
              isActive ? "bg-[var(--brand-accent)] text-white" : "bg-[var(--bg-subtle)] text-[var(--text-muted)]"
            }`}>
              {count}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
