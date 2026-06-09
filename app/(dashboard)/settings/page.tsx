import { Settings, Building2, Users, GitBranch, Truck } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const sections = [
  { icon: Building2, title: "Организация", desc: "Название, логотип, контакты, тарифный план", href: "/settings/org" },
  { icon: Users, title: "Команда", desc: "Пользователи, роли, приглашения", href: "/settings/team" },
  { icon: GitBranch, title: "Филиалы", desc: "Точки продаж и их настройки", href: "/settings/branches" },
  { icon: Truck, title: "Поставщики", desc: "Справочник поставщиков", href: "/settings/suppliers" },
]

export default function SettingsPage() {
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-zinc-500">Управление организацией, командой и интеграциями.</p>
      <div className="space-y-2">
        {sections.map((s) => {
          const Icon = s.icon
          return (
            <Card key={s.title} className="border-zinc-200 shadow-none hover:border-zinc-300 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100">
                  <Icon className="h-5 w-5 text-zinc-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-zinc-800">{s.title}</h3>
                  <p className="text-xs text-zinc-400">{s.desc}</p>
                </div>
                <Badge className="bg-amber-100 text-amber-600 border-0 text-xs">Этап 2</Badge>
              </CardContent>
            </Card>
          )
        })}
      </div>
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-500">
        Настройки организации, авторизация и RLS (Row Level Security) настраиваются в Этапе 2 совместно с подключением Supabase.
      </div>
    </div>
  )
}
