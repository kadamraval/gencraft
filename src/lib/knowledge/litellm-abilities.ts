import type { LitellmEntry } from "../sheet/sources/litellm"
import type { KnowledgePack } from "./schema"

/**
 * What LiteLLM says a model can do, read from the maker's own entry (OpenAI's "gpt-…", Anthropic's "claude-…", Google's "gemini/…"), never
 * from a host's copy: the maker decides what a model can do, the hosts only run it. Kept on the database model as `abilities`.
 */

/** LiteLLM entries that are a host running someone else's model, not the maker's own */
const HOSTS = /^(fal_ai|replicate|openrouter|azure|azure_ai|bedrock|bedrock_converse|vertex_ai|together_ai|fireworks_ai|deepinfra|groq|cerebras|sambanova|nscale|aiml|databricks|watsonx|oci|ovhcloud|nebius|novita|hyperbolic|lambda_ai|featherless_ai|github_copilot|snowflake|cloudflare|perplexity|friendliai|gradient_ai|wandb|heroku|v0|lemonade|nvidia_nim|llamagate|datarobot)$/

const FLAG: Array<[keyof LitellmEntry, string]> = [
  ["supports_vision", "vision"],
  ["supports_function_calling", "actions"],
  ["supports_reasoning", "reasoning"],
  ["supports_web_search", "web-search"],
  ["supports_pdf_input", "pdf"],
  ["supports_audio_input", "audio-in"],
  ["supports_video_input", "video-in"],
  ["supports_response_schema", "structured"],
]

const tailOf = (s: string) => s.toLowerCase().split("/").pop()!.replace(/[:@].*$/, "")

export function addMakerAbilities(pack: KnowledgePack, file: Record<string, LitellmEntry>): number {
  const byTail = new Map<string, LitellmEntry[]>()
  for (const [key, e] of Object.entries(file)) {
    if (key === "sample_spec" || !e.litellm_provider || HOSTS.test(e.litellm_provider)) continue
    const t = tailOf(key)
    byTail.set(t, [...(byTail.get(t) ?? []), e])
  }
  let found = 0
  for (const m of pack.models) {
    const entries = [...new Set(m.lines.map((l) => tailOf(l.endpoint)))].flatMap((t) => byTail.get(t) ?? [])
    if (entries.length === 0) continue
    const abilities = new Set<string>()
    for (const e of entries) {
      for (const [flag, word] of FLAG) if (e[flag] === true) abilities.add(word)
      const endpoints = (e.supported_endpoints as string[] | undefined) ?? []
      if (e.mode === "image_edit" || endpoints.includes("/v1/images/edits")) abilities.add("edit")
    }
    if (abilities.size > 0) {
      m.abilities = [...abilities].sort()
      found++
    }
  }
  return found
}
