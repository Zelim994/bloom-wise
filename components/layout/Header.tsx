"use client"

import { usePathname, useRouter } from "next/navigation"
import { LogOut, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import type { Profile } from "@/lib/supabase/types"

const pageTitles: Record<string, string> = {
  "/": "Главная",
  "/orders": "Заказы",
  "/orders/new": "Новый заказ",
  "/builder": "Собрать букет",
  "/calendar": "Календарь",
  "/inventory": "Склад",
  "/purchases": "Приход товара",
  "/purchases/new": "Новый приход",
  "/writeoffs": "Списания",
  "/writeoffs/new": "Новое списание",
  "/recipes": "Рецепты букетов",
  "/customers": "Клиенты",
  "/reports": "Отчёты",
  "/bloom-ai": "Bloom AI",
  "/settings": "Настройки",
}

export function Header({
  profile,
  onOpenMobileNav,
}: {
  profile: Profile | null
  onOpenMobileNav?: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const title = pageTitles[pathname] ?? "BloomWise"

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 xl:px-6 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {onOpenMobileNav && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-zinc-500 hover:text-zinc-700 xl:hidden"
            onClick={onOpenMobileNav}
            aria-label="Открыть меню"
          >
            <Menu className="h-4 w-4" />
          </Button>
        )}
        <h1 className="text-[15px] font-semibold text-zinc-900 truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-600 text-xs font-semibold hover:bg-rose-200 transition-colors cursor-pointer border-0 outline-none">
            {profile?.full_name?.[0]?.toUpperCase() ?? "?"}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => router.push("/settings")} className="text-sm">
              Настройки
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-sm text-red-600 focus:text-red-600 gap-2"
            >
              <LogOut className="h-3.5 w-3.5" />
              Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
