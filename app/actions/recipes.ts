"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Json, Recipe } from "@/lib/supabase/types"
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

// ── Клиентская валидация рецепта ───────────────────────────────────────────
//
// Уровневый контракт тот же, что у lib/orders/bouquetItems.ts: эти проверки —
// UX и быстрая обратная связь в словах приложения. Авторитетная граница домена
// живёт в save_recipe_atomic (migration_038), которая проверяет те же
// диапазоны в numeric-арифметике до того, как что-либо изменит. Вызывающий,
// который сюда не дошёл, всё равно защищён там.
//
// Диапазоны колонок (measured, не предполагаемые):
//   recipes.cost_price / recommended_price   numeric(10,2)
//   recipes.margin_percent                   numeric(5,2)
//   recipe_items.quantity                    integer, check (> 0)
//   recipe_items.unit_cost                   numeric(10,2)
// PostgreSQL округляет до масштаба колонки ПЕРЕД проверкой точности, поэтому
// границы величины — исключающие и симметричные для отрицательных значений.
//
// В отличие от букета у recipe_items НЕТ колонки total_cost: произведение
// quantity * unit_cost нигде не хранится, поэтому и не проверяется здесь.
const INT4_MAX = 2_147_483_647
const NUMERIC_10_2_ABS_EXCLUSIVE_LIMIT = 99_999_999.995
const NUMERIC_5_2_ABS_EXCLUSIVE_LIMIT = 999.995

function fitsMoney(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) < NUMERIC_10_2_ABS_EXCLUSIVE_LIMIT
}

type RecipeRpcItem = {
  flower_id: string
  variety_id: string | null
  color_id: string | null
  quantity: number
  unit_cost: number
}

type RecipeValidation = { ok: true; items: RecipeRpcItem[] } | { ok: false; error: string }

function validateRecipePayload(payload: RecipePayload): RecipeValidation {
  if (!payload.name.trim()) return { ok: false, error: "Укажите название рецепта" }
  if (payload.items.length === 0) return { ok: false, error: "Добавьте хотя бы один цветок" }

  if (!Number.isFinite(payload.cost_price) || !Number.isFinite(payload.recommended_price)) {
    return { ok: false, error: "Некорректное числовое значение рецепта" }
  }
  // Себестоимость и рекомендуемая цена — суммы, а не сальдо: то же правило,
  // что и в RPC. Отрицательная прибыль при этом остаётся законной.
  if (payload.cost_price < 0 || payload.recommended_price < 0) {
    return { ok: false, error: "Денежные значения рецепта не могут быть отрицательными" }
  }
  if (!fitsMoney(payload.cost_price)) {
    return { ok: false, error: "Себестоимость рецепта вне допустимого диапазона" }
  }
  if (!fitsMoney(payload.recommended_price)) {
    return { ok: false, error: "Рекомендуемая цена рецепта вне допустимого диапазона" }
  }

  // margin_percent считает и записывает сама RPC; здесь то же выражение нужно
  // только чтобы заранее отбить numeric(5,2)-переполнение понятным текстом.
  if (payload.recommended_price > 0) {
    const margin =
      ((payload.recommended_price - payload.cost_price) / payload.recommended_price) * 100
    if (!Number.isFinite(margin) || Math.abs(margin) >= NUMERIC_5_2_ABS_EXCLUSIVE_LIMIT) {
      return {
        ok: false,
        error: "Маржа рецепта вне допустимого диапазона — проверьте себестоимость и цену",
      }
    }
  }

  const items: RecipeRpcItem[] = []
  for (const item of payload.items) {
    if (!item.flower_id) {
      return { ok: false, error: "Не удалось определить цветок в позиции рецепта" }
    }
    // Number.isInteger уже исключает NaN и +-Infinity.
    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > INT4_MAX) {
      return {
        ok: false,
        error: "Количество в позиции рецепта должно быть целым числом от 1 до 2 147 483 647",
      }
    }
    if (!Number.isFinite(item.unit_cost)) {
      return { ok: false, error: "Некорректная себестоимость в позиции рецепта" }
    }
    if (item.unit_cost < 0) {
      return { ok: false, error: "Себестоимость позиции рецепта не может быть отрицательной" }
    }
    if (!fitsMoney(item.unit_cost)) {
      return { ok: false, error: "Себестоимость позиции рецепта вне допустимого диапазона" }
    }

    items.push({
      flower_id: item.flower_id,
      variety_id: item.variety_id ?? null,
      color_id: item.color_id ?? null,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
    })
  }

  return { ok: true, items }
}

/** Достаёт recipe_id из jsonb-ответа RPC, не доверяя его форме. */
function readRecipeId(data: Json): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  if (!("ok" in data) || data.ok !== true) return null
  const value = (data as { recipe_id?: Json }).recipe_id
  return typeof value === "string" && value.length > 0 ? value : null
}

const SAVE_FAILED = "Не удалось подтвердить сохранение рецепта. Проверьте список рецептов перед повторной попыткой."

/**
 * Создаёт или обновляет рецепт вместе со всем его составом.
 *
 * Раньше это были три-четыре отдельных запроса (update/insert шапки → delete
 * позиций → insert позиций), то есть три транзакции: упавшая вставка оставляла
 * рецепт с уже переписанной шапкой и БЕЗ состава, а ошибка delete вообще не
 * проверялась. Теперь всё делает один вызов save_recipe_atomic (migration_038):
 * либо применяется целиком, либо не применяется ничего, и прежний состав
 * переживает ошибку SQL внутри операции. Потерянный ответ не доказывает откат.
 *
 * Организация здесь больше не вычисляется: её выводит сама функция из
 * auth.uid(), поэтому клиентский payload не может на неё повлиять.
 */
export async function upsertRecipe(payload: RecipePayload): Promise<{ error?: string; id?: string }> {
  const validated = validateRecipePayload(payload)
  if (!validated.ok) return { error: validated.error }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc("save_recipe_atomic", {
    p_recipe_id: payload.id ?? null,
    p_recipe: {
      name: payload.name.trim(),
      style: payload.style || null,
      assembly_notes: payload.assembly_notes || null,
      comment: payload.comment || null,
      recommended_price: payload.recommended_price,
      cost_price: payload.cost_price,
    },
    p_items: validated.items,
  })

  // Собственное сообщение RPC остаётся за границей базы: оно может содержать
  // идентификаторы и внутренние детали, поэтому пользователь видит стабильный
  // общий текст. Без подтверждённого ответа не заявляем успех или откат: commit мог состояться.
  if (error) {
    // PostgREST also wraps fetch failures as { error, status: 0 }. Only known
    // PostgreSQL failures prove rollback; an arbitrary error does not.
    const rolledBack = ["P0001", "23502", "23503", "23514", "22003", "22P02", "42501", "40001", "40P01"].includes(error.code)
    return { error: rolledBack ? "Рецепт не сохранён. Проверьте данные и доступ к рецепту." : SAVE_FAILED }
  }

  // Ответ без recipe_id — не успех: ревалидация и редирект на этот id были бы
  // ложью о сохранении.
  const recipeId = readRecipeId(data)
  if (!recipeId) return { error: SAVE_FAILED }

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
