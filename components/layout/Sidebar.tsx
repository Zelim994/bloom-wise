"use client"

import Link from "next/link"
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
}: {
  profile: Profile | null
  orgName?: string | null
  orgLogoUrl?: string | null
}) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/"
    return pathname === href || pathname.startsWith(href + "/")
  }

  return (
    <aside className="flex h-screen w-60 flex-col bg-[#0f0f11] border-r border-[#1f1f22] shrink-0">
      {/* Логотип */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[#1f1f22]">
        {orgLogoUrl ? (
          <img
            src={orgLogoUrl}
            alt="Логотип"
            className="h-8 w-8 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500">
            <span className="text-base">🌸</span>
          </div>
        )}
        <div>
          <span className="text-[15px] font-semibold tracking-tight text-white truncate">
            {orgName || "BloomWise"}
          </span>
          <p className="text-[10px] text-zinc-500 leading-none mt-0.5">Цветочный салон</p>
        </div>
      </div>

      {/* Навигация */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-4" : ""}>
            {group.label && (
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
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
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
                  <span className="flex-1">{item.label}</span>
                  {active && (
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
          className={cn(
            "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
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
          <span>Настройки</span>
        </Link>
        <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 mt-1">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 text-xs font-semibold">
            {profile?.full_name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-300 truncate">
              {profile?.full_name ?? "Пользователь"}
            </p>
            <p className="text-[10px] text-zinc-600 truncate">
              {profile?.role ? roleLabels[profile.role] : ""}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
