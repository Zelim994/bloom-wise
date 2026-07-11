"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import type { Profile } from "@/lib/supabase/types"
import {
  LayoutGrid,
  Plus,
  Flower,
  ShoppingBag,
  CalendarDays,
  Package,
  Library,
  Truck,
  Trash2,
  NotebookText,
  Users,
  BarChart3,
  Sparkles,
  Settings,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"

const roleLabels: Record<string, string> = {
  owner: "Владелец",
  admin: "Администратор",
  florist: "Флорист",
  cashier: "Кассир",
  viewer: "Наблюдатель",
}

const navGroups = [
  {
    items: [
      { label: "Главная", href: "/", icon: LayoutGrid },
      { label: "Новый заказ", href: "/orders/new", icon: Plus, accent: true },
      { label: "Собрать букет", href: "/builder", icon: Flower },
    ],
  },
  {
    label: "ПРОДАЖИ",
    items: [
      { label: "Заказы", href: "/orders", icon: ShoppingBag },
      { label: "Календарь", href: "/calendar", icon: CalendarDays },
      { label: "Клиенты", href: "/customers", icon: Users },
    ],
  },
  {
    label: "ТОВАРЫ",
    items: [
      { label: "Каталог", href: "/catalog", icon: Library },
      { label: "Склад", href: "/inventory", icon: Package },
      { label: "Поставки", href: "/purchases", icon: Truck },
      { label: "Списания", href: "/writeoffs", icon: Trash2 },
      { label: "Рецепты букетов", href: "/recipes", icon: NotebookText },
    ],
  },
  {
    label: "АНАЛИТИКА",
    items: [
      { label: "Отчёты", href: "/reports", icon: BarChart3 },
    ],
  },
  {
    label: "AI",
    items: [
      { label: "Bloom AI", href: "/bloom-ai", icon: Sparkles },
    ],
  },
]

export function Sidebar({
  profile,
  orgName,
  orgLogoUrl,
  collapsed = false,
  mobile = false,
  onNavigate,
  onToggleCollapse,
}: {
  profile: Profile | null
  orgName?: string | null
  orgLogoUrl?: string | null
  collapsed?: boolean
  mobile?: boolean
  onNavigate?: () => void
  onToggleCollapse?: () => void
}) {
  const pathname = usePathname()
  const isRail = collapsed && !mobile

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/"
    return pathname === href || pathname.startsWith(href + "/")
  }

  return (
    <aside
      className={cn(
        "flex h-full flex-col overflow-x-hidden bg-[var(--bg-sidebar)] border-r border-[var(--sidebar-divider)] shrink-0 transition-[width] duration-150",
        isRail ? "w-16" : "w-60"
      )}
    >
      {/* Логотип */}
      <div
        className={cn(
          "flex items-center border-b border-[var(--sidebar-divider)] py-5",
          isRail ? "flex-col gap-2 px-2" : "gap-2.5 px-5"
        )}
      >
        {orgLogoUrl ? (
          <Image
            src={orgLogoUrl}
            alt={orgName ?? "Логотип"}
            width={32}
            height={32}
            unoptimized
            className="h-8 w-8 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-accent)]">
            <span className="text-base">🌸</span>
          </div>
        )}
        {!isRail && (
          <div className="min-w-0 flex-1">
            <span className="text-[15px] font-semibold tracking-tight text-[var(--text-on-dark)] truncate block">
              {orgName || "BloomWise"}
            </span>
            <p className="text-[10px] text-[var(--text-on-dark-muted)] leading-none mt-0.5">Цветочный салон</p>
          </div>
        )}
        {!mobile && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isRail ? "Развернуть меню" : "Свернуть меню"}
            title={isRail ? "Развернуть меню" : "Свернуть меню"}
            className="shrink-0 rounded-lg p-1.5 text-[var(--text-on-dark-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--text-on-dark)] transition-colors"
          >
            {isRail ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* Навигация */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-4" : ""}>
            {group.label && !isRail && (
              <p className="px-3 py-1.5 text-[10px] font-semibold tracking-widest text-[var(--sidebar-section)] uppercase">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const active = isActive(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={isRail ? item.label : undefined}
                  aria-label={isRail ? item.label : undefined}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                    isRail && "justify-center px-0",
                    active
                      ? "bg-[var(--sidebar-active)] text-[var(--text-on-dark)]"
                      : "text-[var(--text-on-dark-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--text-on-dark)]"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      active ? "text-[var(--brand-accent)]" : "text-[var(--text-on-dark-muted)] group-hover:text-[var(--text-on-dark)]"
                    )}
                  />
                  {!isRail && <span className="flex-1">{item.label}</span>}
                  {!isRail && active && (
                    <ChevronRight className="h-3 w-3 text-[var(--brand-accent)] opacity-60" />
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Низ: настройки + пользователь */}
      <div className="border-t border-[var(--sidebar-divider)] p-2 space-y-0.5">
        <Link
          href="/settings"
          onClick={onNavigate}
          title={isRail ? "Настройки" : undefined}
          aria-label={isRail ? "Настройки" : undefined}
          className={cn(
            "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
            isRail && "justify-center px-0",
            isActive("/settings")
              ? "bg-[var(--sidebar-active)] text-[var(--text-on-dark)]"
              : "text-[var(--text-on-dark-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--text-on-dark)]"
          )}
        >
          <Settings
            className={cn(
              "h-4 w-4 shrink-0",
              isActive("/settings") ? "text-[var(--brand-accent)]" : "text-[var(--text-on-dark-muted)] group-hover:text-[var(--text-on-dark)]"
            )}
          />
          {!isRail && <span>Настройки</span>}
        </Link>
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 mt-1",
            isRail && "justify-center gap-0 px-0"
          )}
        >
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent-bg)] text-[var(--brand-accent-text)] font-semibold",
              isRail ? "h-8 w-8 text-sm" : "h-7 w-7 text-xs"
            )}
          >
            {profile?.full_name?.[0]?.toUpperCase() ?? "?"}
          </div>
          {!isRail && (
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--text-on-dark)] truncate">
                {profile?.full_name ?? "Пользователь"}
              </p>
              <p className="text-[10px] text-[var(--sidebar-section)] truncate">
                {profile?.role ? roleLabels[profile.role] : ""}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
