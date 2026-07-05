"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import type { Profile } from "@/lib/supabase/types"
import {
  LayoutDashboard,
  Plus,
  Scissors,
  ClipboardList,
  Calendar,
  Package,
  Library,
  Truck,
  Trash2,
  BookOpen,
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
      { label: "Главная", href: "/", icon: LayoutDashboard },
      { label: "Новый заказ", href: "/orders/new", icon: Plus, accent: true },
      { label: "Собрать букет", href: "/builder", icon: Scissors },
    ],
  },
  {
    label: "ПРОДАЖИ",
    items: [
      { label: "Заказы", href: "/orders", icon: ClipboardList },
      { label: "Календарь", href: "/calendar", icon: Calendar },
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
      { label: "Рецепты букетов", href: "/recipes", icon: BookOpen },
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
        "flex h-full flex-col overflow-x-hidden bg-[#0f0f11] border-r border-[#1f1f22] shrink-0 transition-[width] duration-150",
        isRail ? "w-16" : "w-60"
      )}
    >
      {/* Логотип */}
      <div
        className={cn(
          "flex items-center border-b border-[#1f1f22] py-5",
          isRail ? "flex-col gap-2 px-2" : "gap-2.5 px-5"
        )}
      >
        {orgLogoUrl ? (
          <Image
            src={orgLogoUrl}
            alt={orgName ?? "Логотип"}
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500">
            <span className="text-base">🌸</span>
          </div>
        )}
        {!isRail && (
          <div className="min-w-0 flex-1">
            <span className="text-[15px] font-semibold tracking-tight text-white truncate block">
              {orgName || "BloomWise"}
            </span>
            <p className="text-[10px] text-zinc-500 leading-none mt-0.5">Цветочный салон</p>
          </div>
        )}
        {!mobile && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isRail ? "Развернуть меню" : "Свернуть меню"}
            title={isRail ? "Развернуть меню" : "Свернуть меню"}
            className="shrink-0 rounded-lg p-1.5 text-zinc-500 hover:bg-[#1a1a1e] hover:text-zinc-200 transition-colors"
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
              <p className="px-3 py-1.5 text-[10px] font-semibold tracking-widest text-zinc-600 uppercase">
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
                      ? "bg-[#1e1e22] text-white"
                      : "text-zinc-400 hover:bg-[#1a1a1e] hover:text-zinc-200"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      active ? "text-rose-400" : "text-zinc-500 group-hover:text-zinc-300"
                    )}
                  />
                  {!isRail && <span className="flex-1">{item.label}</span>}
                  {!isRail && active && (
                    <ChevronRight className="h-3 w-3 text-rose-400 opacity-60" />
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Низ: настройки + пользователь */}
      <div className="border-t border-[#1f1f22] p-2 space-y-0.5">
        <Link
          href="/settings"
          onClick={onNavigate}
          title={isRail ? "Настройки" : undefined}
          aria-label={isRail ? "Настройки" : undefined}
          className={cn(
            "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
            isRail && "justify-center px-0",
            isActive("/settings")
              ? "bg-[#1e1e22] text-white"
              : "text-zinc-400 hover:bg-[#1a1a1e] hover:text-zinc-200"
          )}
        >
          <Settings
            className={cn(
              "h-4 w-4 shrink-0",
              isActive("/settings") ? "text-rose-400" : "text-zinc-500 group-hover:text-zinc-300"
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
              "flex shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 font-semibold",
              isRail ? "h-8 w-8 text-sm" : "h-7 w-7 text-xs"
            )}
          >
            {profile?.full_name?.[0]?.toUpperCase() ?? "?"}
          </div>
          {!isRail && (
            <div className="min-w-0">
              <p className="text-xs font-medium text-zinc-300 truncate">
                {profile?.full_name ?? "Пользователь"}
              </p>
              <p className="text-[10px] text-zinc-600 truncate">
                {profile?.role ? roleLabels[profile.role] : ""}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
