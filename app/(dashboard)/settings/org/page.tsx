import Link from "next/link"
import { redirect } from "next/navigation"
import { Building2, ChevronLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { OrganizationSettingsForm } from "@/components/settings/OrganizationSettingsForm"
import { getSafeOrganizationLogoUrl } from "@/lib/organization/logo"
import type { OrgSettingsInput } from "@/app/actions/settings"

export default async function OrgSettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, role, full_name, phone")
    .eq("id", user.id)
    .single()

  if (!profile?.organization_id) redirect("/settings")

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, settings")
    .eq("id", profile.organization_id)
    .single()

  const s = (org?.settings as Record<string, string | null>) ?? {}

  const initial: OrgSettingsInput = {
    orgName: org?.name ?? "",
    orgPhone: s.phone ?? "",
    orgWhatsapp: s.whatsapp ?? "",
    orgAddress: s.address ?? "",
    currency: s.currency ?? "RUB",
    timezone: s.timezone ?? "Europe/Moscow",
    ownerFullName: profile.full_name ?? "",
    ownerPhone: profile.phone ?? "",
  }

  const logoUrl = getSafeOrganizationLogoUrl(org?.settings)
  const canManageSettings = profile.role === "owner" || profile.role === "admin"

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Настройки
      </Link>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100">
          <Building2 className="h-5 w-5 text-zinc-500" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Организация</h1>
          <p className="text-xs text-zinc-400">Название, контакты, настройки салона</p>
        </div>
      </div>
      <OrganizationSettingsForm
        initial={initial}
        logoUrl={logoUrl}
        canManageSettings={canManageSettings}
      />
    </div>
  )
}
