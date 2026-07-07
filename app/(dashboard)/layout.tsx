import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardShell } from "@/components/layout/DashboardShell"
import { getSafeOrganizationLogoUrl } from "@/lib/organization/logo"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  if (profile?.is_active === false) {
    redirect("/deactivated")
  }

  // Пользователь подтвердил email, но ещё не создал организацию
  // (например, пришёл через /auth/callback, минуя login)
  if (profile && !profile.organization_id) {
    const salonName =
      (user.user_metadata?.salon_name as string | undefined) ?? "Мой салон"
    await supabase.rpc("create_my_organization", { p_org_name: salonName })
  }

  const { data: org } = profile?.organization_id
    ? await supabase
        .from("organizations")
        .select("name, settings")
        .eq("id", profile.organization_id)
        .single()
    : { data: null }

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
