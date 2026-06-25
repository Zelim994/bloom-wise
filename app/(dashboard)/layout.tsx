import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Sidebar } from "@/components/layout/Sidebar"
import { Header } from "@/components/layout/Header"

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
        .select("name")
        .eq("id", profile.organization_id)
        .single()
    : { data: null }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f8fa]">
      <Sidebar profile={profile} orgName={org?.name ?? null} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header profile={profile} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
