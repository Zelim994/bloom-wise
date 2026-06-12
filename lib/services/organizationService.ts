import type { createClient } from "@/lib/supabase/server"

export async function getOrgId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()

  if (profile?.organization_id) return profile.organization_id

  const salonName: string = user.user_metadata?.salon_name ?? "Мой салон"
  const { data: newOrgId, error } = await supabase.rpc("create_my_organization", { p_org_name: salonName })
  if (error) console.error("[getOrgId] create_my_organization failed:", error.message)
  return newOrgId ?? null
}
