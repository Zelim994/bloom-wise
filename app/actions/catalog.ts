"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Flower, FlowerVariety, FlowerColor, FlowerImage } from "@/lib/supabase/types"

export type FlowerWithDetails = Flower & {
  primary_image_url: string | null
  varieties: Pick<FlowerVariety, "id" | "name" | "size">[]
  colors: Pick<FlowerColor, "id" | "name" | "hex_code">[]
}

async function getOrgId(): Promise<{ orgId: string | null; error?: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { orgId: null, error: "Не авторизован" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()

  const orgId = profile?.organization_id
  if (orgId) return { orgId }

  const salonName: string = user.user_metadata?.salon_name ?? "Мой салон"
  const { data: newOrgId, error: rpcErr } = await supabase.rpc(
    "create_my_organization",
    { p_org_name: salonName }
  )
  if (rpcErr) return { orgId: null, error: "Не удалось создать организацию: " + rpcErr.message }
  return { orgId: newOrgId ?? null }
}

export async function getCatalogFlowers(): Promise<FlowerWithDetails[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("flowers")
    .select(`
      *,
      flower_images(id, url, is_primary, sort_order),
      flower_varieties(id, name, size),
      flower_colors(id, name, hex_code)
    `)
    .eq("is_active", true)
    .order("category")
    .order("name")

  return (data ?? []).map((f) => {
    const { flower_images: rawImgs, flower_varieties: rawVars, flower_colors: rawCols, ...base } =
      f as typeof f & { flower_images: FlowerImage[]; flower_varieties: FlowerVariety[]; flower_colors: FlowerColor[] }
    const imgs = rawImgs ?? []
    const sorted = [...imgs].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const primary = sorted.find((i) => i.is_primary) ?? sorted[0]
    return {
      ...base,
      primary_image_url: primary?.url ?? null,
      varieties: (rawVars ?? []).map((v) => ({ id: v.id, name: v.name, size: v.size })),
      colors: (rawCols ?? []).map((c) => ({ id: c.id, name: c.name, hex_code: c.hex_code })),
    }
  })
}

export async function getFlowerById(id: string): Promise<FlowerWithDetails | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("flowers")
    .select(`
      *,
      flower_images(id, url, is_primary, sort_order),
      flower_varieties(id, name, size),
      flower_colors(id, name, hex_code)
    `)
    .eq("id", id)
    .single()

  if (!data) return null
  const { flower_images: rawImgs, flower_varieties: rawVars, flower_colors: rawCols, ...base } =
    data as typeof data & { flower_images: FlowerImage[]; flower_varieties: FlowerVariety[]; flower_colors: FlowerColor[] }
  const sorted = [...(rawImgs ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const primary = sorted.find((i) => i.is_primary) ?? sorted[0]
  return {
    ...base,
    primary_image_url: primary?.url ?? null,
    varieties: (rawVars ?? []).map((v) => ({ id: v.id, name: v.name, size: v.size })),
    colors: (rawCols ?? []).map((c) => ({ id: c.id, name: c.name, hex_code: c.hex_code })),
  }
}

export async function upsertFlower(formData: {
  id?: string
  name: string
  category: string
  unit: string
  description?: string
  florist_comment?: string
  min_stock?: number
  photoFile?: string | null
  varieties?: { name: string; size?: string }[]
  colors?: { name: string; hex_code?: string }[]
}): Promise<{ error?: string; id?: string }> {
  const { orgId, error: orgError } = await getOrgId()
  if (!orgId) return { error: orgError ?? "Организация не найдена" }

  const supabase = await createClient()

  const payload = {
    name: formData.name,
    category: formData.category,
    unit: formData.unit,
    description: formData.description || null,
    florist_comment: formData.florist_comment || null,
    min_stock: formData.min_stock ?? 0,
    updated_at: new Date().toISOString(),
  }

  let flowerId = formData.id

  if (flowerId) {
    const { error } = await supabase.from("flowers").update(payload).eq("id", flowerId)
    if (error) return { error: error.message }
  } else {
    const { data, error } = await supabase
      .from("flowers")
      .insert({ ...payload, organization_id: orgId })
      .select("id")
      .single()
    if (error || !data) return { error: error?.message ?? "Ошибка создания" }
    flowerId = data.id
  }

  revalidatePath("/catalog")
  return { id: flowerId }
}

export async function uploadFlowerImage(
  flowerId: string,
  url: string,
  isPrimary = true
): Promise<{ error?: string }> {
  const supabase = await createClient()

  if (isPrimary) {
    await supabase
      .from("flower_images")
      .update({ is_primary: false })
      .eq("flower_id", flowerId)
  }

  const { error } = await supabase.from("flower_images").insert({
    flower_id: flowerId,
    url,
    is_primary: isPrimary,
    sort_order: 0,
  })
  if (error) return { error: error.message }

  revalidatePath("/catalog")
  return {}
}

export async function deleteFlowerImage(imageId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("flower_images").delete().eq("id", imageId)
  if (error) return { error: error.message }
  revalidatePath("/catalog")
  return {}
}

export async function addFlowerVariety(
  flowerId: string,
  name: string,
  size?: string
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("flower_varieties")
    .insert({ flower_id: flowerId, name, size: size || null })
    .select("id")
    .single()
  if (error || !data) return { error: error?.message ?? "Ошибка" }
  revalidatePath("/catalog")
  return { id: data.id }
}

export async function deleteFlowerVariety(varietyId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("flower_varieties").delete().eq("id", varietyId)
  if (error) return { error: error.message }
  revalidatePath("/catalog")
  return {}
}

export async function addFlowerColor(
  flowerId: string,
  name: string,
  hexCode?: string
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("flower_colors")
    .insert({ flower_id: flowerId, name, hex_code: hexCode || null })
    .select("id")
    .single()
  if (error || !data) return { error: error?.message ?? "Ошибка" }
  revalidatePath("/catalog")
  return { id: data.id }
}

export async function deleteFlowerColor(colorId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("flower_colors").delete().eq("id", colorId)
  if (error) return { error: error.message }
  revalidatePath("/catalog")
  return {}
}

export async function archiveFlower(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("flowers")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/catalog")
  return {}
}
