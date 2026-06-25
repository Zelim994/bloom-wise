import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft, Users } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { ALL_ROLE_LABELS } from "@/lib/team/roles"
import { TeamRoleSelect } from "@/components/settings/TeamRoleSelect"

const roleOrder: Record<string, number> = {
  owner: 0,
  admin: 1,
  florist: 2,
  cashier: 3,
  viewer: 4,
}

export default async function TeamPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, role")
    .eq("id", user.id)
    .single()

  if (!profile?.organization_id) {
    return (
      <div className="max-w-2xl space-y-4">
        <BackLink />
        <p className="text-sm text-zinc-500">
          У вашего профиля пока нет организации. Завершите настройку аккаунта.
        </p>
      </div>
    )
  }

  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name, role, phone, is_active, created_at")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: true })

  const sorted = (members ?? []).sort(
    (a, b) =>
      (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99) ||
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const ownerCount = sorted.filter((m) => m.role === "owner").length
  const canManage = profile.role === "owner" || profile.role === "admin"

  return (
    <div className="max-w-2xl space-y-6">
      {/* Заголовок */}
      <BackLink />

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100">
          <Users className="h-5 w-5 text-zinc-500" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Команда</h1>
          <p className="text-xs text-zinc-400">Сотрудники вашей организации</p>
        </div>
      </div>

      {/* Информационный блок */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
        Владелец может управлять ролями сотрудников. Приглашения сотрудников появятся на следующем этапе.
      </div>

      {/* Список сотрудников */}
      <div className="space-y-2">
        {sorted.length === 0 ? (
          <p className="text-sm text-zinc-400">Сотрудников пока нет.</p>
        ) : (
          sorted.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white px-4 py-3"
            >
              {/* Аватар-заглушка */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 text-sm font-semibold">
                {member.full_name?.[0]?.toUpperCase() ?? "?"}
              </div>

              {/* Данные */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-800 truncate">
                  {member.full_name || "Без имени"}
                </p>
                <p className="text-xs text-zinc-400 truncate">
                  {member.phone || "Телефон не указан"}
                </p>
              </div>

              {/* Роль */}
              <div className="shrink-0 text-right space-y-1">
                {canManage ? (
                  <TeamRoleSelect
                    memberId={member.id}
                    currentRole={member.role}
                    currentUserRole={profile.role}
                    ownerCount={ownerCount}
                  />
                ) : (
                  <p className="text-xs font-medium text-zinc-600">
                    {ALL_ROLE_LABELS[member.role] ?? member.role}
                  </p>
                )}
                <p
                  className={`text-[11px] font-medium ${
                    member.is_active !== false
                      ? "text-green-600"
                      : "text-zinc-400"
                  }`}
                >
                  {member.is_active !== false ? "Активен" : "Отключён"}
                </p>
              </div>

              {/* Дата */}
              <div className="shrink-0 text-right hidden sm:block">
                <p className="text-[11px] text-zinc-400">
                  {new Date(member.created_at).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Кнопка приглашения — только owner/admin, disabled */}
      {canManage && (
        <div className="flex items-center gap-3">
          <button
            disabled
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-400 cursor-not-allowed"
          >
            Пригласить сотрудника
          </button>
          <Badge className="bg-amber-100 text-amber-600 border-0 text-xs">Скоро</Badge>
        </div>
      )}
      {!canManage && (
        <p className="text-xs text-zinc-400">
          Управление сотрудниками доступно только владельцу или администратору.
        </p>
      )}
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/settings"
      className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      Настройки
    </Link>
  )
}
