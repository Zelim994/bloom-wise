import type { ImageGenerationResult, ImageProvider, ImageProviderName } from "./types"

export class NanoBananaImageProvider implements ImageProvider {
  readonly name: ImageProviderName = "nano_banana"
  readonly model: string
  readonly quality: string

  constructor() {
    this.model = process.env.NANO_BANANA_IMAGE_MODEL || "gemini-3.1-flash-image"
    this.quality = process.env.NANO_BANANA_IMAGE_SIZE || "1K"
  }

  estimateCostCents(): number {
    if (this.quality === "4K") return 15
    if (this.quality === "2K") return 10
    return 7
  }

  async generateImage(_prompt: string): Promise<ImageGenerationResult> {
    void _prompt
    if (!process.env.GEMINI_API_KEY) {
      return { success: false, error: "GEMINI_API_KEY не настроен" }
    }

    // Real API call disabled until 6.0B-5C controlled E2E test
    return {
      success: false,
      error: "Nano Banana provider подключён, но реальные вызовы отключены до controlled E2E test.",
    }
  }
}
