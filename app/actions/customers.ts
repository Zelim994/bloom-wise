"use server"

import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/services/organizationService"
import { revalidatePath } from "next/cache"

export type CreateCustomerResult =
  | { success: true; id: string }
  | { error: string; existingId?: string }

export async function createCustomer(formData: {
  full_name: string
  phone: string
  comment: string
}): Promise<CreateCustomerResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Не авторизован" }

  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "Организация не найдена" }

  const full_name = formData.full_name.trim()
  const phone = formData.phone.trim()
  const comment = formData.comment.trim()

  if (!full_name) return { error: "Имя клиента обязательно" }

  if (phone) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", orgId)
      .eq("phone", phone)
      .limit(1)
      .maybeSingle()

    if (existing) {
      return { error: "Клиент с таким телефоном уже существует", existingId: existing.id }
    }
  }

  const { data: newCustomer, error: insertError } = await supabase
    .from("customers")
    .insert({
      organization_id: orgId,
      full_name,
      phone: phone || null,
      comment: comment || null,
      created_by: user.id,
    })
    .select("id")
    .single()

  if (insertError) return { error: insertError.message }

  revalidatePath("/customers")
  return { success: true, id: newCustomer.id }
}
