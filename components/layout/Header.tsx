"use client"

import { usePathname, useRouter } from "next/navigation"
import { Bell, Search, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  "/inventory": "Каталог товаров",
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

export function Header({ profile }: { profile: Profile | null }) {
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
    <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6 shrink-0">
      <h1 className="text-[15px] font-semibold text-zinc-900">{title}</h1>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-700">
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 text-zinc-400 hover:text-zinc-700">
          <Bell className="h-4 w-4" />
          <Badge className="absolute -top-0.5 -right-0.5 h-4 w-4 p-0 flex items-center justify-center text-[9px] bg-rose-500 text-white border-0">
            3
          </Badge>
        </Button>

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
