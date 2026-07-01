import type { ImageProvider } from "./types"
import { OpenAIImageProvider } from "./openaiProvider"

export { type ImageProvider, type ImageProviderName, type ImageGenerationResult } from "./types"

export function getImageProvider(): ImageProvider {
  const providerName = process.env.AI_IMAGE_PROVIDER ?? "openai"
  if (providerName === "nano_banana") {
    console.warn("[AI] nano_banana provider not yet implemented, falling back to openai")
    return new OpenAIImageProvider()
  }
  if (providerName !== "openai") {
    console.warn(`[AI] Unknown image provider "${providerName}", falling back to openai`)
    return new OpenAIImageProvider()
  }
  return new OpenAIImageProvider()
}
