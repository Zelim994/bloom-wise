"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Recipe } from "@/lib/supabase/types"

export type RecipeItemRow = {
  id: string
  flower_id: string | null
  quantity: number
  unit_cost: number | null
  note: string | null
  flowers: { name: string; unit: string } | null
}

export type RecipeWithItems = Recipe & { recipe_items: RecipeItemRow[] }

async function getOrgId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()
  if (profile?.organization_id) return profile.organization_id
  const salonName: string = user.user_metadata?.salon_name ?? "Мой салон"
  const { data: newOrgId } = await supabase.rpc("create_my_organization", { p_org_name: salonName })
  return newOrgId ?? null
}

export async function getRecipes(): Promise<Recipe[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("recipes")
    .select("*")
    .eq("is_active", true)
    .order("name")
  return data ?? []
}

export async function getRecipe(id: string): Promise<RecipeWithItems | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("recipes")
    .select("*, recipe_items(id, flower_id, quantity, unit_cost, note, flowers(name, unit))")
    .eq("id", id)
    .single()
  return data as unknown as RecipeWithItems | null
}

export type RecipePayload = {
  id?: string
  name: string
  style: string
  assembly_notes: string
  comment: string
  recommended_price: number
  items: Array<{
    flower_id: string
    quantity: number
    unit_cost: number
  }>
  cost_price: number
}

export async function upsertRecipe(payload: RecipePayload): Promise<{ error?: string; id?: string }> {
  if (!payload.name.trim()) return { error: "Укажите название рецепта" }
  if (payload.items.length === 0) return { error: "Добавьте хотя бы один цветок" }

  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "Организация не найдена" }

  const margin =
    payload.recommended_price > 0
      ? ((payload.recommended_price - payload.cost_price) / payload.recommended_price) * 100
      : null

  let recipeId = payload.id

  if (recipeId) {
    // Update existing
    const { error } = await supabase
      .from("recipes")
      .update({
        name: payload.name.trim(),
        style: payload.style || null,
        assembly_notes: payload.assembly_notes || null,
        comment: payload.comment || null,
        recommended_price: payload.recommended_price || null,
        cost_price: payload.cost_price,
        margin_percent: margin,
      })
      .eq("id", recipeId)
    if (error) return { error: error.message }

    // Replace items
    await supabase.from("recipe_items").delete().eq("recipe_id", recipeId)
  } else {
    // Create new
    const { data, error } = await supabase
      .from("recipes")
      .insert({
        organization_id: orgId,
        name: payload.name.trim(),
        style: payload.style || null,
        assembly_notes: payload.assembly_notes || null,
        comment: payload.comment || null,
        recommended_price: payload.recommended_price || null,
        cost_price: payload.cost_price,
        margin_percent: margin,
        is_active: true,
      })
      .select("id")
      .single()
    if (error || !data) return { error: error?.message ?? "Ошибка создания рецепта" }
    recipeId = data.id
  }

  const { error: ie } = await supabase.from("recipe_items").insert(
    payload.items.map((item) => ({
      recipe_id: recipeId!,
      flower_id: item.flower_id,
      product_id: null,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
    }))
  )
  if (ie) return { error: ie.message }

  revalidatePath("/recipes")
  revalidatePath(`/recipes/${recipeId}`)
  return { id: recipeId }
}

export async function archiveRecipe(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("recipes")
    .update({ is_active: false })
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/recipes")
  return {}
}
