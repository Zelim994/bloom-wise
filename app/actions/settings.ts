"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export type OrgSettingsInput = {
  orgName: string
  orgPhone: string
  orgWhatsapp: string
  orgAddress: string
  currency: string
  timezone: string
  ownerFullName: string
  ownerPhone: string
}

export async function updateOrganizationSettings(
  input: OrgSettingsInput
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) return { error: "Не авторизован" }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, organization_id, role")
    .eq("id", user.id)
    .single()

  if (profileError || !profile?.organization_id) {
    return { error: "Профиль не найден" }
  }

  if (profile.role !== "owner" && profile.role !== "admin") {
    return { error: "Недостаточно прав" }
  }

  const orgId = profile.organization_id

  // Читаем текущий settings для merge (не затираем неизвестные ключи)
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .single()

  const existing = (org?.settings as Record<string, unknown>) ?? {}
  const newSettings = {
    ...existing,
    phone: input.orgPhone.trim() || null,
    whatsapp: input.orgWhatsapp.trim() || null,
    address: input.orgAddress.trim() || null,
    currency: input.currency || "RUB",
    timezone: input.timezone || "Europe/Moscow",
  }

  const { error: orgError } = await supabase
    .from("organizations")
    .update({ name: input.orgName.trim(), settings: newSettings })
    .eq("id", orgId)

  if (orgError) return { error: orgError.message }

  const { error: profileUpdateError } = await supabase
    .from("profiles")
    .update({
      full_name: input.ownerFullName.trim() || null,
      phone: input.ownerPhone.trim() || null,
    })
    .eq("id", user.id)

  if (profileUpdateError) return { error: profileUpdateError.message }

  revalidatePath("/settings")
  revalidatePath("/settings/org")
  revalidatePath("/", "layout")

  return {}
}
