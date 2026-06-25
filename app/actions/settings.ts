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

export async function uploadOrganizationLogo(
  formData: FormData
): Promise<{ error?: string; url?: string }> {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { error: "Не авторизован" }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, organization_id, role")
    .eq("id", user.id)
    .single()

  if (profileError || !profile?.organization_id) return { error: "Профиль не найден" }
  if (profile.role !== "owner" && profile.role !== "admin") return { error: "Недостаточно прав" }

  const file = formData.get("logo")
  if (!(file instanceof File) || file.size === 0) return { error: "Файл не выбран" }

  const MAX_SIZE = 2 * 1024 * 1024
  if (file.size > MAX_SIZE) return { error: "Файл больше 2 МБ" }

  const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"]
  if (!ALLOWED_MIME.includes(file.type)) return { error: "Разрешены только PNG, JPG, WEBP" }

  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }
  const ext = extMap[file.type]
  const path = `${profile.organization_id}/logo/logo.${ext}`

  const { error: uploadError } = await supabase.storage
    .from("organization-assets")
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) return { error: uploadError.message }

  const { data: { publicUrl } } = supabase.storage
    .from("organization-assets")
    .getPublicUrl(path)

  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", profile.organization_id)
    .single()

  const existing = (org?.settings as Record<string, unknown>) ?? {}
  const newSettings = {
    ...existing,
    logo_url: publicUrl,
    logo_path: path,
  }

  const { error: updateError } = await supabase
    .from("organizations")
    .update({ settings: newSettings })
    .eq("id", profile.organization_id)

  if (updateError) return { error: updateError.message }

  revalidatePath("/settings")
  revalidatePath("/settings/org")
  revalidatePath("/", "layout")

  return { url: publicUrl }
}
