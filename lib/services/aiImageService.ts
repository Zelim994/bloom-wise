import OpenAI from "openai"

export async function generateBouquetImageFromPrompt(
  prompt: string
): Promise<{ imageUrl: string } | { error: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { error: "AI-генерация не настроена. Добавьте OPENAI_API_KEY в .env.local" }
  }

  try {
    const client = new OpenAI({ apiKey })
    const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1"
    const quality = (process.env.OPENAI_IMAGE_QUALITY || "medium") as "low" | "medium" | "high" | "auto"
    const response = await client.images.generate({
      model,
      prompt,
      n: 1,
      size: "1024x1024",
      quality,
    })

    const image = response.data?.[0]

    let imageUrl: string | null = null
    if (image?.b64_json) {
      imageUrl = `data:image/png;base64,${image.b64_json}`
    } else if (image?.url) {
      // Fetch from OpenAI server-side so the client always gets a data URL.
      // The URL here comes from the OpenAI API response, not user input.
      const fetched = await fetch(image.url)
      if (fetched.ok) {
        const buf = Buffer.from(await fetched.arrayBuffer())
        imageUrl = `data:image/png;base64,${buf.toString("base64")}`
      }
    }

    if (!imageUrl) {
      return { error: "Не удалось получить изображение от AI" }
    }

    return { imageUrl }
  } catch (err: unknown) {
    if (err instanceof OpenAI.APIError) {
      if (err.status === 403 || err.message.toLowerCase().includes("organization") || err.message.toLowerCase().includes("verification")) {
        return {
          error:
            "Модель генерации изображения недоступна для этого OpenAI-аккаунта. Проверьте доступ к GPT Image в OpenAI dashboard.",
        }
      }
      return { error: `Ошибка OpenAI: ${err.message}` }
    }
    return { error: "Не удалось сгенерировать изображение. Попробуйте ещё раз." }
  }
}
