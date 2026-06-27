"use server"

import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/services/organizationService"
import { revalidatePath } from "next/cache"

export type SupplierInput = {
  name: string
  phone?: string
  email?: string
  contact_person?: string
  address?: string
  payment_terms?: string
  comment?: string
}

function trim(v?: string): string | null {
  const s = v?.trim()
  return s ? s : null
}

async function getAuthContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Не авторизован" as const, supabase, user: null, profile: null, orgId: null }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, role")
    .eq("id", user.id)
    .single()

  if (!profile?.organization_id) return { error: "Профиль не найден" as const, supabase, user, profile: null, orgId: null }

  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "Организация не найдена" as const, supabase, user, profile, orgId: null }

  return { error: null, supabase, user, profile, orgId }
}

export type SupplierRow = {
  id: string
  name: string
  phone: string | null
  email: string | null
  contact_person: string | null
  address: string | null
  payment_terms: string | null
  comment: string | null
  is_active: boolean
  created_at: string
}

export async function getSuppliersForSettings(
  includeInactive = false
): Promise<SupplierRow[]> {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return []

  let query = supabase
    .from("suppliers")
    .select("id, name, phone, email, contact_person, address, payment_terms, comment, is_active, created_at")
    .eq("organization_id", orgId)
    .order("name")

  if (!includeInactive) query = query.eq("is_active", true)

  const { data } = await query
  return (data ?? []) as SupplierRow[]
}

export async function createSupplier(
  input: SupplierInput
): Promise<{ error?: string }> {
  const ctx = await getAuthContext()
  if (ctx.error) return { error: ctx.error }

  const { supabase, user, profile, orgId } = ctx
  if (profile!.role !== "owner" && profile!.role !== "admin") return { error: "Недостаточно прав" }

  const name = input.name.trim()
  if (!name) return { error: "Название обязательно" }

  const { error } = await supabase.from("suppliers").insert({
    organization_id: orgId!,
    name,
    phone: trim(input.phone),
    email: trim(input.email),
    contact_person: trim(input.contact_person),
    address: trim(input.address),
    payment_terms: trim(input.payment_terms),
    comment: trim(input.comment),
    is_active: true,
    created_by: user!.id,
  })

  if (error) return { error: error.message }
  revalidatePath("/settings/suppliers")
  revalidatePath("/purchases/new")
  return {}
}

export async function updateSupplier(
  id: string,
  input: SupplierInput
): Promise<{ error?: string }> {
  const ctx = await getAuthContext()
  if (ctx.error) return { error: ctx.error }

  const { supabase, profile, orgId } = ctx
  if (profile!.role !== "owner" && profile!.role !== "admin") return { error: "Недостаточно прав" }

  const name = input.name.trim()
  if (!name) return { error: "Название обязательно" }

  const { error } = await supabase
    .from("suppliers")
    .update({
      name,
      phone: trim(input.phone),
      email: trim(input.email),
      contact_person: trim(input.contact_person),
      address: trim(input.address),
      payment_terms: trim(input.payment_terms),
      comment: trim(input.comment),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", orgId!)

  if (error) return { error: error.message }
  revalidatePath("/settings/suppliers")
  revalidatePath("/purchases/new")
  return {}
}

export async function toggleSupplierActive(
  id: string,
  isActive: boolean
): Promise<{ error?: string }> {
  const ctx = await getAuthContext()
  if (ctx.error) return { error: ctx.error }

  const { supabase, profile, orgId } = ctx
  if (profile!.role !== "owner" && profile!.role !== "admin") return { error: "Недостаточно прав" }

  const { error } = await supabase
    .from("suppliers")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", orgId!)

  if (error) return { error: error.message }
  revalidatePath("/settings/suppliers")
  revalidatePath("/purchases/new")
  return {}
}
