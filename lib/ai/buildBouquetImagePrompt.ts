// Single source of truth for the AI bouquet-image prompt.
//
// Imported by BOTH the server action that actually calls the image provider
// (app/actions/ai.ts) and the client preview that shows the user what will be
// sent (components/bouquet-builder/AIVisualizationPanel.tsx). Keeping one
// implementation is what guarantees "Показать prompt" cannot drift away from
// the text the provider really receives.
//
// This module must stay pure and isomorphic: no "use server", no process.env,
// no Supabase, no provider SDK, no side effects — only plain serializable
// input in, string out. Anything else would drag server-only code (or secrets)
// into the client bundle.

/** Minimal per-flower shape. Both the server's SelectedItem and the client's
 *  BouquetItem structurally satisfy this. */
export type BouquetPromptItem = {
  name: string
  variety_name?: string | null
  variety_size?: string | null
  color_name?: string | null
  quantity: number
}

/** Visualization controls. palette/comment are optional and omitted from the
 *  prompt entirely when empty. */
export type BouquetPromptParams = {
  style: string
  shape: string
  wrapping: string
  occasion: string
  palette?: string | null
  comment?: string | null
}

export function buildBouquetImagePrompt(
  items: BouquetPromptItem[],
  params: BouquetPromptParams
): string {
  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0)

  const itemLines = items.map((item) => {
    const parts: string[] = [item.name]
    if (item.variety_name) parts.push(item.variety_name)
    if (item.variety_size) parts.push(`размер ${item.variety_size}`)
    if (item.color_name) parts.push(`цвет ${item.color_name}`)
    return `- ${parts.join(", ")} — РОВНО ${item.quantity} шт.`
  })

  const sections: string[] = [
    "ПРИОРИТЕТЫ (при конфликте требований соблюдай более высокий):",
    "1. Точное количество цветочных головок и виды цветов.",
    "2. Указанные цвета и сорта.",
    "3. Форма, стиль и упаковка.",
    "4. Фотореалистичность и художественность.\n",
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
    `СОСТАВ БУКЕТА — РОВНО ${totalQuantity} цветочных головок:`,
    itemLines.join("\n"),
    `\nНа фотографии должно быть видно РОВНО ${totalQuantity} цветочных головок — не больше и не меньше.`,
    "Каждая цветочная головка должна быть полностью видна, отдельно различима, не перекрыта другими цветами и не обрезана краем кадра.",
    "Показывай только раскрытые цветочные головки — не заменяй заявленные головки бутонами.",
    "Если ради точного количества букет нужно сделать менее плотным — сделай его менее плотным: точное количество важнее пышности.\n",
    "СТИЛЬ И ФОРМА:",
    `Стиль: ${params.style}`,
    `Форма: ${params.shape}`,
    `Повод: ${params.occasion}\n`,
    "УПАКОВКА:",
    `Используй только выбранный тип упаковки: ${params.wrapping}.`,
    "Если выбрана матовая бумага — упаковка должна быть однотонной или спокойной, без ярких разноцветных листов, если пользователь отдельно не указал яркие цвета.\n",
  ]

  if (params.palette) {
    sections.push(
      `ЦВЕТОВАЯ ГАММА:\nСоблюдай указанную цветовую гамму: ${params.palette}.\nНе добавляй контрастные цвета, если они не указаны пользователем.\n`
    )
  }
  if (params.comment) {
    sections.push(`ПОЖЕЛАНИЕ КЛИЕНТА:\n${params.comment}\n`)
  }

  sections.push(
    "НЕ ДОБАВЛЯТЬ:",
    "- дополнительные цветочные головки или бутоны сверх указанного количества;",
    "- другие виды цветов;",
    "- другие цвета цветов;",
    "- декоративные цветы, которых нет в составе;",
    "- искусственные украшения, если они не указаны;",
    "- ягоды, сухоцветы, гипсофилу, зелень или аксессуары, если пользователь не выбрал их."
  )

  return sections.join("\n")
}
