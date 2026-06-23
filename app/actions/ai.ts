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

export async function generateBouquetImage(
  payload: GeneratePayload
): Promise<GenerateResult> {
  const { selectedItems, visualizationParams } = payload

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

  const result = await generateBouquetImageFromPrompt(enhancedPrompt)

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
