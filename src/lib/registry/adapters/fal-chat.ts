import type { ModelRecord } from "../types"
import { fetchOpenRouterModels } from "./openrouter"

/**
 * fal's chat models. fal runs language models through an OpenAI-compatible endpoint powered by OpenRouter
 * (https://fal.ai/models/openrouter/router), so the models are OpenRouter's, and so is each one's own list of what it
 * takes (including `tools`). They are listed here as fal's, because fal is who is called and who bills.
 */

export const FAL_CHAT_BASE = "https://fal.run/openrouter/router/openai/v1"

export async function fetchFalChatModels(signal?: AbortSignal): Promise<ModelRecord[]> {
  const all = await fetchOpenRouterModels(signal)
  return all
    // Variants such as :free or :batch are routes of OpenRouter's own, not models fal serves
    .filter((r) => r.modality === "text" && !r.endpoint.includes(":"))
    .map((r) => ({ ...r, id: `fal-chat/${r.endpoint}`, provider: "fal", price: { ...r.price, source: "estimate" as const } }))
}
