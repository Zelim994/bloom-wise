"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Recipe } from "@/lib/supabase/types"
import { getOrgId } from "@/lib/services/organizationService"
import type { InitialBuilderItem } from "@/types/builder"

export type RecipeItemRow = {
  id: string
  flower_id: string | null
  variety_id: string | null
  color_id: string | null
  quantity: number
  unit_cost: number | null
  note: string | null
  flowers: { name: string; unit: string } | null
}

export type RecipeWithItems = Recipe & { recipe_items: RecipeItemRow[] }

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
    .select("*, recipe_items(id, flower_id, variety_id, color_id, quantity, unit_cost, note, flowers(name, unit))")
    .eq("id", id)
    .single()
  return data as unknown as RecipeWithItems | null
}

export type RecipeOrderPrefill = {
  recipeId: string
  recipeName: string
  initialItems: InitialBuilderItem[]
  initialSalePrice: number | undefined
}

// Read adapter for prefilling a new order/bouquet from a saved recipe.
// Recipe holds a composition template + a recommended-price snapshot only —
// live stock/cost enrichment for these items still happens in BuilderLayout
// via its existing flowers-prop matcher, not here.
export async function getRecipeForOrderPrefill(id: string): Promise<RecipeOrderPrefill | null> {
  const recipe = await getRecipe(id)
  if (!recipe) return null

  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    initialItems: recipe.recipe_items
      .filter((i) => i.flower_id && i.flowers)
      .map((i) => ({
        flower_id: i.flower_id!,
        variety_id: i.variety_id ?? null,
        color_id: i.color_id ?? null,
        name: i.flowers!.name,
        unit: i.flowers!.unit,
        quantity: i.quantity,
        unit_cost: i.unit_cost ?? 0,
      })),
    initialSalePrice: recipe.recommended_price ?? undefined,
  }
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
    variety_id: string | null
    color_id: string | null
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
      variety_id: item.variety_id,
      color_id: item.color_id,
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
