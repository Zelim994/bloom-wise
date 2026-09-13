import type { createClient } from "@/lib/supabase/server"

// Чистое чтение членства. Организацию здесь не создаём: единственная точка
// создания — явная форма /onboarding (CORE-READY-G2-B2).
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

  return profile?.organization_id ?? null
}
