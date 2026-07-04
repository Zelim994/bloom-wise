import { GoogleGenAI } from "@google/genai"
import type { ImageGenerationResult, ImageProvider, ImageProviderName } from "./types"

export class NanoBananaImageProvider implements ImageProvider {
  readonly name: ImageProviderName = "nano_banana"
  readonly model: string
  readonly quality: string

  constructor() {
    this.model = process.env.NANO_BANANA_IMAGE_MODEL || "gemini-2.5-flash-image"
    this.quality = process.env.NANO_BANANA_IMAGE_SIZE || "1K"
  }

  estimateCostCents(): number {
    if (this.quality === "4K") return 15
    if (this.quality === "2K") return 10
    return 7
  }

  async generateImage(prompt: string): Promise<ImageGenerationResult> {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return { success: false, error: "GEMINI_API_KEY не настроен" }
    }

    try {
      const ai = new GoogleGenAI({ apiKey })

      const interaction = await ai.interactions.create({
        model: this.model,
        input: prompt,
        response_modalities: ["image"],
      })

      const base64 = interaction.output_image?.data
      const mimeType = interaction.output_image?.mime_type || "image/png"

      if (!base64) {
        return {
          success: false,
          error: "Nano Banana не вернул изображение (output_image.data пустой).",
        }
      }

      return {
        success: true,
        imageUrl: `data:${mimeType};base64,${base64}`,
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        error: `Ошибка вызова Nano Banana: ${message}`,
      }
    }
  }
}
