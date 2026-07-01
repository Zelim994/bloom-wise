import type { ImageProvider } from "./types"
import { OpenAIImageProvider } from "./openaiProvider"
import { NanoBananaImageProvider } from "./nanoBananaProvider"

export { type ImageProvider, type ImageProviderName, type ImageGenerationResult } from "./types"

export function getImageProvider(): ImageProvider {
  const providerName = process.env.AI_IMAGE_PROVIDER ?? "openai"
  if (providerName === "nano_banana") {
    return new NanoBananaImageProvider()
  }
  if (providerName !== "openai") {
    console.warn(`[AI] Unknown image provider "${providerName}", falling back to openai`)
    return new OpenAIImageProvider()
  }
  return new OpenAIImageProvider()
}
