"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Flower, FlowerVariety, FlowerColor, FlowerImage } from "@/lib/supabase/types"
import { getOrgId } from "@/lib/services/organizationService"

export type FlowerWithDetails = Flower & {
  primary_image_url: string | null
  varieties: Pick<FlowerVariety, "id" | "name" | "size">[]
  colors: Pick<FlowerColor, "id" | "name" | "hex_code">[]
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

function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase()
}

async function generateSku(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
): Promise<string> {
  const { data } = await supabase
    .from("flowers")
    .select("sku")
    .eq("organization_id", orgId)
    .like("sku", "FLW-%")

  const SKU_RE = /^FLW-(\d{6})$/
  let maxNum = 0
  for (const row of data ?? []) {
    if (!row.sku) continue
    const match = row.sku.match(SKU_RE)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > maxNum) maxNum = num
    }
  }
  return `FLW-${String(maxNum + 1).padStart(6, "0")}`
}

export async function upsertFlower(formData: {
  id?: string
  name: string
  category: string
  unit: string
  sku?: string
  description?: string
  florist_comment?: string
  photoFile?: string | null
  varieties?: { name: string; size?: string }[]
  colors?: { name: string; hex_code?: string }[]
}): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "Не удалось определить организацию" }

  // min_stock и sale_price убраны из каталога: форма их не передаёт.
  // При UPDATE они не попадают в payload — DB сохраняет прежние значения.
  // При INSERT ставим безопасные дефолты.
  const basePayload = {
    name: formData.name,
    category: formData.category,
    unit: formData.unit,
    description: formData.description || null,
    florist_comment: formData.florist_comment || null,
    updated_at: new Date().toISOString(),
  }

  let flowerId = formData.id

  if (flowerId) {
    // Редактирование: обновляем sku только если пользователь ввёл значение
    const updatePayload: typeof basePayload & { sku?: string } = { ...basePayload }
    if (formData.sku?.trim()) updatePayload.sku = normalizeSku(formData.sku)

    const { error } = await supabase.from("flowers").update(updatePayload).eq("id", flowerId)
    if (error) {
      if (error.code === "23505") return { error: "Такой артикул уже существует" }
      return { error: error.message }
    }
  } else {
    // Создание: используем введённый sku или генерируем автоматически
    const sku = formData.sku?.trim() ? normalizeSku(formData.sku) : await generateSku(supabase, orgId)

    const { data, error } = await supabase
      .from("flowers")
      .insert({ ...basePayload, organization_id: orgId, sku, min_stock: 0, sale_price: null })
      .select("id")
      .single()
    if (error) {
      if (error.code === "23505") return { error: "Такой артикул уже существует" }
      return { error: error.message ?? "Ошибка создания" }
    }
    if (!data) return { error: "Ошибка создания" }
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
