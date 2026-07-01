import { generateBouquetImageFromPrompt } from "@/lib/services/aiImageService"
import type { ImageGenerationResult, ImageProvider, ImageProviderName } from "./types"

export class OpenAIImageProvider implements ImageProvider {
  readonly name: ImageProviderName = "openai"
  readonly model: string
  readonly quality: string

  constructor() {
    this.model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1"
    this.quality = process.env.OPENAI_IMAGE_QUALITY || "medium"
  }

  estimateCostCents(): number {
    if (this.quality === "high") return 19
    if (this.quality === "medium") return 7
    if (this.quality === "low") return 4
    return 7
  }

  async generateImage(prompt: string): Promise<ImageGenerationResult> {
    const result = await generateBouquetImageFromPrompt(prompt)
    if ("error" in result) return { success: false, error: result.error }
    return { success: true, imageUrl: result.imageUrl }
  }
}
