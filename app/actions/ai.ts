"use server"

import { randomUUID } from "crypto"
import { createClient } from "@/lib/supabase/server"
import { generateBouquetImageFromPrompt } from "@/lib/services/aiImageService"

type SelectedItem = {
  flower_id?: string | null
  variety_id?: string | null
  color_id?: string | null
  name: string
  variety_name?: string | null
  variety_size?: string | null
  color_name?: string | null
  quantity: number
}

type VisualizationParams = {
  style: string
  shape: string
  palette?: string
  wrapping: string
  occasion: string
  comment?: string
}

export type GeneratePayload = {
  prompt: string
  selectedItems: SelectedItem[]
  visualizationParams: VisualizationParams
}

export type GenerateResult =
  | { success: true; imageUrl: string; promptUsed: string }
  | { success: false; error: string }

export type SavePayload = {
  imageUrl: string
  prompt: string
  selectedItems: SelectedItem[]
  visualizationParams: VisualizationParams
}

export type SaveResult =
  | { success: true; imagePath: string }
  | { success: false; error: string }

function estimateOpenAIImageCostCents(quality: string | undefined): number {
  if (quality === "high") return 19
  if (quality === "medium") return 7
  if (quality === "low") return 4
  return 7
}

export async function generateBouquetImage(
  payload: GeneratePayload
): Promise<GenerateResult> {
  const { selectedItems, visualizationParams } = payload

  // Input validation — no provider call, not counted toward limit
  if (!payload.prompt?.trim()) {
    return { success: false, error: "Prompt не может быть пустым" }
  }
  if (!selectedItems?.length) {
    return { success: false, error: "Выберите хотя бы один цветок" }
  }
  if (selectedItems.some((i) => i.quantity <= 0)) {
    return { success: false, error: "Количество цветов должно быть больше 0" }
  }
  if (!process.env.OPENAI_API_KEY) {
    return {
      success: false,
      error: "AI-генерация не настроена. Добавьте OPENAI_API_KEY в .env.local",
    }
  }

  // Auth + organization
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Необходима авторизация" }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, organization_id")
    .eq("id", user.id)
    .single()

  if (profileError || !profile?.id || !profile.organization_id) {
    return { success: false, error: "Профиль не найден" }
  }

  const orgId = profile.organization_id

  // Daily rate limit
  const rawLimit = Number.parseInt(process.env.AI_DAILY_LIMIT_PER_ORG ?? "20", 10)
  const dailyLimit = Number.isFinite(rawLimit) && rawLimit >= 1 ? rawLimit : 20

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { count } = await supabase
    .from("ai_requests")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("request_type", "ai_image_generation_attempt")
    .gte("created_at", todayStart.toISOString())

  if ((count ?? 0) >= dailyLimit) {
    return {
      success: false,
      error: `Достигнут дневной лимит AI-генераций (${dailyLimit}). Попробуйте завтра.`,
    }
  }

  // Build prompt
  const totalQuantity = selectedItems.reduce((sum, i) => sum + i.quantity, 0)

  const itemLines = selectedItems.map((item) => {
    const parts: string[] = [item.name]
    if (item.variety_name) parts.push(item.variety_name)
    if (item.variety_size) parts.push(`размер ${item.variety_size}`)
    if (item.color_name) parts.push(`цвет ${item.color_name}`)
    return `- ${item.quantity} видимых цветочных головок: ${parts.join(", ")}`
  })

  const enhancedPrompt = [
    "ФОТОРЕАЛИЗМ:",
    "Создай максимально реалистичную фотографию настоящего букета, как будто его собрал профессиональный флорист и сфотографировал на камеру в цветочном салоне.",
    "- живые натуральные цветы, не пластиковые, не мультяшные, не 3D-рендер;",
    "- реалистичные лепестки с естественными изгибами, фактурой и небольшими несовершенствами;",
    "- естественные зелёные листья и стебли;",
    "- профессиональная флористическая сборка;",
    "- мягкий естественный свет;",
    "- реалистичная глубина резкости;",
    "- чистый светлый фон;",
    "- коммерческое фото для отправки клиенту в WhatsApp;",
    "- без людей, без рук, без текста, без логотипов, без лишних предметов.\n",
    `СОСТАВ БУКЕТА (${totalQuantity} цветочных головок):`,
    itemLines.join("\n"),
    `\nОбщее количество цветочных головок в букете: ${totalQuantity}.`,
    `Постарайся визуально показать около ${totalQuantity} хорошо различимых цветочных головок.`,
    "Не уменьшая количество, собери букет так, чтобы большая часть головок была видна сверху и спереди.",
    `Если точное количество сложно показать из-за плотной композиции, сохрани визуальное ощущение полного букета из ${totalQuantity} цветов: букет должен выглядеть объёмным, плотным и соответствовать указанному количеству.\n`,
    `СТИЛЬ И ФОРМА:`,
    `Стиль: ${visualizationParams.style}`,
    `Форма: ${visualizationParams.shape}`,
    `Повод: ${visualizationParams.occasion}\n`,
    "УПАКОВКА:",
    `Используй только выбранный тип упаковки: ${visualizationParams.wrapping}.`,
    `Если выбрана матовая бумага — упаковка должна быть однотонной или спокойной, без ярких разноцветных листов, если пользователь отдельно не указал яркие цвета.\n`,
    visualizationParams.palette
      ? `ЦВЕТОВАЯ ГАММА:\nСоблюдай указанную цветовую гамму: ${visualizationParams.palette}.\nНе добавляй контрастные цвета, если они не указаны пользователем.\n`
      : "",
    visualizationParams.comment
      ? `ПОЖЕЛАНИЕ КЛИЕНТА:\n${visualizationParams.comment}\n`
      : "",
    "НЕ ДОБАВЛЯТЬ:",
    "- другие виды цветов;",
    "- другие цвета цветов;",
    "- декоративные цветы, которых нет в составе;",
    "- искусственные украшения, если они не указаны;",
    "- ягоды, сухоцветы, гипсофилу, зелень или аксессуары, если пользователь не выбрал их.",
  ]
    .filter(Boolean)
    .join("\n")

  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1"
  const quality = process.env.OPENAI_IMAGE_QUALITY || "medium"

  // Insert attempt row BEFORE provider call — counted toward limit regardless of outcome
  const { data: attemptRow, error: attemptInsertError } = await supabase
    .from("ai_requests")
    .insert({
      organization_id: orgId,
      created_by: profile.id,
      request_type: "ai_image_generation_attempt",
      mode: "free_idea",
      prompt: enhancedPrompt,
      image_path: null,
      model_used: model,
      input_params: {
        selected_items: selectedItems,
        visualization_params: visualizationParams,
      },
      response_data: {
        provider: "openai",
        status: "started",
        estimated_cost_cents: 0,
        source: "builder",
      },
    })
    .select("id")
    .single()

  if (attemptInsertError || !attemptRow?.id) {
    return {
      success: false,
      error: "Не удалось зафиксировать AI-запрос. Попробуйте позже.",
    }
  }

  // Provider call
  const result = await generateBouquetImageFromPrompt(enhancedPrompt)

  // Update attempt row with final status — soft fail: log but don't block the response
  const updatedResponseData =
    "error" in result
      ? {
          provider: "openai",
          status: "error",
          estimated_cost_cents: 0,
          error_message: result.error,
          quality,
          model,
          source: "builder",
        }
      : {
          provider: "openai",
          status: "success",
          estimated_cost_cents: estimateOpenAIImageCostCents(quality),
          quality,
          model,
          source: "builder",
        }

  const { error: updateError } = await supabase
    .from("ai_requests")
    .update({ response_data: updatedResponseData })
    .eq("id", attemptRow.id)

  if (updateError) {
    console.error("[AI] Failed to update attempt row after provider call:", updateError.message)
  }

  if ("error" in result) {
    return { success: false, error: result.error }
  }

  return { success: true, imageUrl: result.imageUrl, promptUsed: enhancedPrompt }
}

export async function saveAIBouquetGeneration(
  payload: SavePayload
): Promise<SaveResult> {
  const { imageUrl, prompt, selectedItems, visualizationParams } = payload

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Необходима авторизация" }

  // profiles.id = auth.users.id, но FK в ai_requests.created_by ссылается на profiles(id).
  // Используем profile.id явно, и organization_id берём оттуда же.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, organization_id")
    .eq("id", user.id)
    .single()

  if (profileError || !profile?.id || !profile.organization_id) {
    return { success: false, error: "Не удалось определить профиль пользователя" }
  }

  const orgId = profile.organization_id

  // Only data URLs are accepted — HTTP URLs are rejected to prevent SSRF.
  // aiImageService always returns data: URLs (converts remote URLs server-side).
  if (!imageUrl.startsWith("data:image/")) {
    return { success: false, error: "Неверный формат изображения" }
  }

  const base64 = imageUrl.split(",")[1]
  const imageData = Buffer.from(base64, "base64")

  const generationId = randomUUID()
  const imagePath = `${orgId}/${generationId}.png`

  const { error: uploadError } = await supabase.storage
    .from("ai-generations")
    .upload(imagePath, imageData, { contentType: "image/png", upsert: false })

  if (uploadError) {
    return { success: false, error: `Ошибка загрузки изображения: ${uploadError.message}` }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("ai_requests")
    .insert({
      organization_id: orgId,
      created_by: profile.id,
      request_type: "bouquet_image",
      mode: "free_idea",
      prompt,
      image_path: imagePath,
      model_used: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      input_params: {
        selected_items: selectedItems,
        visualization_params: visualizationParams,
      },
      response_data: {
        provider: "openai",
        image_path: imagePath,
        saved_from: "builder",
      },
    })
    .select("id")
    .single()

  if (insertError || !inserted?.id) {
    await supabase.storage.from("ai-generations").remove([imagePath])
    return {
      success: false,
      error: insertError
        ? `Ошибка сохранения записи: ${insertError.message}`
        : "Запись не была создана (RLS или ошибка БД)",
    }
  }

  return { success: true, imagePath }
}

// ─── Этап 3.4: история генераций ─────────────────────────────────────────────

export type AIGenerationItem = {
  id: string
  created_at: string
  image_path: string | null
  signed_url: string | null
  model_used: string | null
  prompt: string | null
  selected_items: Array<{
    name: string
    quantity: number
    variety_name: string | null
    variety_size: string | null
    color_name: string | null
  }>
  visualization_params: {
    style: string | null
    shape: string | null
    wrapping: string | null
    occasion: string | null
    palette: string | null
    comment: string | null
  }
}

export type GetGenerationsResult =
  | { success: true; items: AIGenerationItem[] }
  | { success: false; error: string }

export async function getAIBouquetGenerations(): Promise<GetGenerationsResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Необходима авторизация" }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, organization_id")
    .eq("id", user.id)
    .single()

  if (profileError || !profile?.organization_id) {
    return { success: false, error: "Профиль не найден" }
  }

  const { data: rows, error: rowsError } = await supabase
    .from("ai_requests")
    .select("id, created_at, image_path, model_used, prompt, input_params")
    .eq("organization_id", profile.organization_id)
    .eq("request_type", "bouquet_image")
    .order("created_at", { ascending: false })
    .limit(50)

  if (rowsError) {
    return { success: false, error: `Ошибка чтения истории: ${rowsError.message}` }
  }

  const items = await Promise.all(
    (rows ?? []).map(async (row): Promise<AIGenerationItem> => {
      let signed_url: string | null = null
      if (row.image_path) {
        const { data: urlData } = await supabase.storage
          .from("ai-generations")
          .createSignedUrl(row.image_path, 60 * 60)
        signed_url = urlData?.signedUrl ?? null
      }

      // Безопасный разбор JSONB — не падаем от старых/битых записей
      const params =
        row.input_params !== null && typeof row.input_params === "object" && !Array.isArray(row.input_params)
          ? (row.input_params as Record<string, unknown>)
          : {}
      const rawItems = Array.isArray(params.selected_items) ? params.selected_items : []
      const rawViz =
        params.visualization_params !== null &&
        typeof params.visualization_params === "object" &&
        !Array.isArray(params.visualization_params)
          ? (params.visualization_params as Record<string, unknown>)
          : {}

      return {
        id: row.id,
        created_at: row.created_at,
        image_path: row.image_path,
        signed_url,
        model_used: row.model_used,
        prompt: row.prompt,
        selected_items: rawItems.map((item: unknown) => {
          const i =
            item !== null && typeof item === "object" && !Array.isArray(item)
              ? (item as Record<string, unknown>)
              : {}
          return {
            name: typeof i.name === "string" ? i.name : "",
            quantity: typeof i.quantity === "number" ? i.quantity : 0,
            variety_name: typeof i.variety_name === "string" ? i.variety_name : null,
            variety_size: typeof i.variety_size === "string" ? i.variety_size : null,
            color_name: typeof i.color_name === "string" ? i.color_name : null,
          }
        }),
        visualization_params: {
          style: typeof rawViz.style === "string" ? rawViz.style : null,
          shape: typeof rawViz.shape === "string" ? rawViz.shape : null,
          wrapping: typeof rawViz.wrapping === "string" ? rawViz.wrapping : null,
          occasion: typeof rawViz.occasion === "string" ? rawViz.occasion : null,
          palette: typeof rawViz.palette === "string" ? rawViz.palette : null,
          comment: typeof rawViz.comment === "string" ? rawViz.comment : null,
        },
      }
    })
  )

  return { success: true, items }
}
