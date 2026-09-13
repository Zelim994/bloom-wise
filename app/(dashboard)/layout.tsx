import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardShell } from "@/components/layout/DashboardShell"
import { getSafeOrganizationLogoUrl } from "@/lib/organization/logo"
import { getAccountState, getDashboardRedirect } from "@/lib/auth/accountState"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // Только чтение: организация создаётся исключительно явной формой /onboarding
  const state = await getAccountState(supabase)

  const target = getDashboardRedirect(state)
  if (target) redirect(target)

  if (state.status !== "member") {
    // profile_error: не выдаём сбой чтения за «нет организации»
    throw new Error("Не удалось загрузить профиль пользователя")
  }

  const { profile, organizationId } = state

  const { data: org } = await supabase
    .from("organizations")
    .select("name, settings")
    .eq("id", organizationId)
    .single()

  const orgLogoUrl = getSafeOrganizationLogoUrl(org?.settings)

  return (
    <DashboardShell
      profile={profile}
      orgName={org?.name ?? null}
      orgLogoUrl={orgLogoUrl}
    >
      {children}
    </DashboardShell>
  )
}
