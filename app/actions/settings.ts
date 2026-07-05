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

  // name обновляем напрямую — это не часть settings jsonb
  const { error: orgError } = await supabase
    .from("organizations")
    .update({ name: input.orgName.trim() })
    .eq("id", orgId)

  if (orgError) return { error: orgError.message }

  // Атомарный merge settings через RPC (устраняет read-merge-write race
  // с uploadOrganizationLogo — logo_url/logo_path больше не теряются)
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "merge_organization_settings",
    {
      p_patch: {
        phone: input.orgPhone.trim() || null,
        whatsapp: input.orgWhatsapp.trim() || null,
        address: input.orgAddress.trim() || null,
        currency: input.currency || "RUB",
        timezone: input.timezone || "Europe/Moscow",
      },
    }
  )

  if (rpcError) return { error: rpcError.message }

  const settingsResult = rpcResult as { ok?: boolean; error?: string } | null
  if (settingsResult?.error) return { error: settingsResult.error }

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

  // Атомарный merge settings через RPC (устраняет read-merge-write race
  // с updateOrganizationSettings — logo_url/logo_path больше не теряются)
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "merge_organization_settings",
    { p_patch: { logo_url: publicUrl, logo_path: path } }
  )

  if (rpcError) return { error: rpcError.message }

  const settingsResult = rpcResult as { ok?: boolean; error?: string } | null
  if (settingsResult?.error) return { error: settingsResult.error }

  revalidatePath("/settings")
  revalidatePath("/settings/org")
  revalidatePath("/", "layout")

  return { url: publicUrl }
}
