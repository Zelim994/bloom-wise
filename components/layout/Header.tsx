"use client"

import { useRouter } from "next/navigation"
import { ChevronDown, LogOut, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import { ALL_ROLE_LABELS } from "@/lib/team/roles"
import type { Profile } from "@/lib/supabase/types"

export function Header({
  profile,
  onOpenMobileNav,
}: {
  profile: Profile | null
  onOpenMobileNav?: () => void
}) {
  const router = useRouter()

  const displayName = profile?.full_name?.trim() || "Пользователь"
  const initial = displayName.charAt(0).toUpperCase() || "?"
  const roleLabel =
    profile?.role && profile.role in ALL_ROLE_LABELS
      ? ALL_ROLE_LABELS[profile.role]
      : "Сотрудник"

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-4 xl:px-6 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {onOpenMobileNav && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] md:hidden"
            onClick={onOpenMobileNav}
            aria-label="Открыть меню"
          >
            <Menu className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Открыть меню профиля: ${displayName}`}
            className="flex items-center gap-2 rounded-full p-1.5 md:pr-3 border border-transparent md:border-[var(--border)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent-bg)] text-[var(--brand-accent-text)] text-xs font-semibold">
              {initial}
            </span>
            <span className="hidden md:flex flex-col items-start min-w-0 max-w-[140px]">
              <span className="text-sm font-medium text-[var(--text-heading)] truncate w-full text-left leading-tight">
                {displayName}
              </span>
              <span className="text-xs text-[var(--text-secondary)] truncate w-full text-left leading-tight">
                {roleLabel}
              </span>
            </span>
            <ChevronDown className="hidden md:block h-4 w-4 text-[var(--text-secondary)] shrink-0" aria-hidden="true" />
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
