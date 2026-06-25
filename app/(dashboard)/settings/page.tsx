import Link from "next/link"
import { Building2, Users, GitBranch, Truck, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const sections = [
  { icon: Building2, title: "Организация", desc: "Название, контакты, настройки салона", href: "/settings/org", ready: true },
  { icon: Users, title: "Команда", desc: "Пользователи, роли, приглашения", href: "/settings/team", ready: true },
  { icon: GitBranch, title: "Филиалы", desc: "Точки продаж и их настройки", href: "/settings/branches", ready: false },
  { icon: Truck, title: "Поставщики", desc: "Справочник поставщиков", href: "/settings/suppliers", ready: false },
]

export default function SettingsPage() {
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-zinc-500">Управление организацией, командой и интеграциями.</p>
      <div className="space-y-2">
        {sections.map((s) => {
          const Icon = s.icon
          const card = (
            <Card className="border-zinc-200 shadow-none hover:border-zinc-300 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100">
                  <Icon className="h-5 w-5 text-zinc-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-zinc-800">{s.title}</h3>
                  <p className="text-xs text-zinc-400">{s.desc}</p>
                </div>
                {s.ready
                  ? <ChevronRight className="h-4 w-4 text-zinc-300" />
                  : <Badge className="bg-amber-100 text-amber-600 border-0 text-xs">Скоро</Badge>}
              </CardContent>
            </Card>
          )
          return s.ready
            ? <Link key={s.title} href={s.href}>{card}</Link>
            : <div key={s.title}>{card}</div>
        })}
      </div>
    </div>
  )
}
