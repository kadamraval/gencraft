import type { RegistryModality } from "./types"

/** The final provider list. Nothing outside these five appears anywhere in the app. */
export const PROVIDERS = [
  { id: "fal", label: "fal.ai", keyField: "falApiKey", keyUrl: "https://fal.ai/dashboard/keys", keyHint: "fal key" },
  { id: "replicate", label: "Replicate", keyField: "replicateApiKey", keyUrl: "https://replicate.com/account/api-tokens", keyHint: "Replicate token (r8_...)" },
  { id: "openrouter", label: "OpenRouter", keyField: "openrouterApiKey", keyUrl: "https://openrouter.ai/keys", keyHint: "OpenRouter key (sk-or-...)" },
  { id: "gemini", label: "Google Gemini", keyField: "geminiApiKey", keyUrl: "https://aistudio.google.com/apikey", keyHint: "Gemini key (AIza...)" },
  { id: "openai", label: "OpenAI", keyField: "openaiApiKey", keyUrl: "https://platform.openai.com/api-keys", keyHint: "OpenAI key (sk-...)" },
] as const

export type ProviderId = (typeof PROVIDERS)[number]["id"]

export const PROVIDER_IDS: readonly string[] = PROVIDERS.map((p) => p.id)

export function providerLabel(id: string): string {
  return PROVIDERS.find((p) => p.id === id)?.label ?? id
}

/**
 * What the app can actually run today, per provider and kind of output.
 * A model outside this table is hidden instead of silently producing a fake result.
 * Flip an entry the moment its connector exists in live-connectors.ts.
 */
export const RUNNABLE: Record<ProviderId, ReadonlyArray<RegistryModality>> = {
  fal: ["image", "video", "audio", "text"],
  replicate: ["text", "image", "video", "audio"],
  openrouter: ["text", "image", "video", "audio"],
  gemini: ["text", "image", "video", "audio"],
  openai: ["text", "image", "video", "audio"],
}

export function isRunnable(provider: string, modality: RegistryModality): boolean {
  return (RUNNABLE[provider as ProviderId] ?? []).includes(modality)
}
