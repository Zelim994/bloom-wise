"use client"

import { useEffect, useState } from "react"
import { Sidebar } from "@/components/layout/Sidebar"
import { Header } from "@/components/layout/Header"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { Profile } from "@/lib/supabase/types"

const SIDEBAR_COLLAPSED_KEY = "bloomwise.sidebar.collapsed"

type DashboardShellProps = {
  profile: Profile | null
  orgName?: string | null
  orgLogoUrl?: string | null
  children: React.ReactNode
}

export function DashboardShell({
  profile,
  orgName,
  orgLogoUrl,
  children,
}: DashboardShellProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  // Читаем сохранённое предпочтение только после монтирования,
  // чтобы серверный и первый клиентский рендер совпадали (без hydration mismatch)
  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (stored === "true") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsCollapsed(true)
    }
  }, [])

  function toggleCollapsed() {
    setIsCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      return next
    })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f8fa]">
      {/* Desktop sidebar — виден только на xl и выше */}
      <div className="hidden xl:flex">
        <Sidebar
          profile={profile}
          orgName={orgName}
          orgLogoUrl={orgLogoUrl}
          collapsed={isCollapsed}
          onToggleCollapse={toggleCollapsed}
        />
      </div>

      {/* Tablet/mobile drawer — ниже xl, открывается через hamburger в Header */}
      <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
        <SheetContent side="left" className="w-72 max-w-[85vw] p-0 xl:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Меню навигации</SheetTitle>
          </SheetHeader>
          <Sidebar
            profile={profile}
            orgName={orgName}
            orgLogoUrl={orgLogoUrl}
            mobile
            onNavigate={() => setIsMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header profile={profile} onOpenMobileNav={() => setIsMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 xl:p-6">{children}</main>
      </div>
    </div>
  )
}
