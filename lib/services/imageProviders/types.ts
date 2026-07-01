export type ImageProviderName = "openai" | "nano_banana"

export type ImageGenerationResult =
  | { success: true; imageUrl: string }
  | { success: false; error: string }

export interface ImageProvider {
  name: ImageProviderName
  model: string
  quality: string
  estimateCostCents(): number
  generateImage(prompt: string): Promise<ImageGenerationResult>
}
