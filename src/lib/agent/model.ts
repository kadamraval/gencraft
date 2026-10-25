import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import type { LanguageModel, ToolSet } from "ai"
import { appFetch, isDesktopApp } from "@/lib/registry/net"
import { FAL_CHAT_BASE } from "@/lib/registry/adapters/fal-chat"
import type { ModelRecord } from "@/lib/registry/types"
import { replicateModel } from "./replicate-model"
import { textToolsModel } from "./text-tools"

/**
 * The chat model the agent thinks with, made from the person's own key. Every provider that has chat models can run it:
 * OpenAI, Google Gemini, OpenRouter and fal speak the OpenAI-style tool format (fal through its OpenAI-compatible
 * endpoint), and Replicate, or any model that does not list tool support, is given tools in plain words (text-tools.ts). The desktop app calls the provider straight; a
 * browser goes through the dev proxy for the two providers that refuse browser calls.
 */

export const AGENT_PROVIDERS = ["openai", "openrouter", "gemini", "fal", "replicate"] as const
export type AgentProvider = (typeof AGENT_PROVIDERS)[number]

export const canRunAgent = (provider: string): provider is AgentProvider => (AGENT_PROVIDERS as readonly string[]).includes(provider)

const PROXY: Array<[string, string]> = [
  ["https://api.openai.com", "/api/proxy/openai"],
  ["https://generativelanguage.googleapis.com", "/api/proxy/gemini"],
  ["https://fal.run", "/api/proxy/runfal"],
]

/** fetch for the SDK: the desktop HTTP plugin in the app, the dev proxy in a browser */
export const agentFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (isDesktopApp()) return appFetch(url, init)
  const hit = PROXY.find(([host]) => url.startsWith(host))
  return fetch(hit ? `${hit[1]}${url.slice(hit[0].length)}` : input, init)
}

/** fal wants "Authorization: Key <key>"; the OpenAI client sends "Bearer <key>", so the header is rewritten on the way out */
const falFetcher = (inner: typeof fetch): typeof fetch => async (input, init) => {
  const headers = new Headers(init?.headers)
  const auth = headers.get("authorization")
  if (auth?.startsWith("Bearer ")) headers.set("authorization", `Key ${auth.slice(7)}`)
  return inner(input, { ...init, headers })
}

/** Models that cannot take a `tools` parameter get tools in plain words instead */
export function needsTextTools(record: { provider: string; tools?: boolean }): boolean {
  if (record.provider === "replicate") return true
  return (record.provider === "fal" || record.provider === "openrouter") && record.tools === false
}

type ModelLike = { provider: string; endpoint: string; tools?: boolean }

function nativeModel(record: ModelLike, key: string, fetcher: typeof fetch): LanguageModel {
  switch (record.provider) {
    case "openai":
      return createOpenAI({ apiKey: key, fetch: fetcher }).chat(record.endpoint)
    case "gemini":
      return createGoogleGenerativeAI({ apiKey: key, fetch: fetcher })(record.endpoint)
    case "openrouter":
      return createOpenRouter({ apiKey: key, fetch: fetcher, headers: { "X-Title": "Gencraft" } }).chat(record.endpoint)
    case "fal":
      return createOpenAI({ apiKey: key, baseURL: FAL_CHAT_BASE, fetch: falFetcher(fetcher) }).chat(record.endpoint)
    case "replicate":
      if (!("params" in record)) throw new Error("A Replicate model needs its full record to be run.")
      return replicateModel(record as ModelRecord, key)
    default:
      throw new Error(`${record.provider} has no chat models this app can run.`)
  }
}

export function studioModel(record: ModelLike, apiKey: string, fetcher: typeof fetch = agentFetch): LanguageModel {
  const model = nativeModel(record, apiKey.trim(), fetcher)
  return needsTextTools(record) ? textToolsModel(model as Parameters<typeof textToolsModel>[0]) : model
}

/** The chat-completions address of each provider, for the small calls that do not need the agent (voice replies) */
export const CHAT_ENDPOINT: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
}

/**
 * The chat model with, when asked, the web search its provider offers: OpenAI's and Google's run on their side and
 * return sources; OpenRouter searches when ":online" follows the model's name.
 */
export function chatModelFor(record: { provider: string; endpoint: string }, apiKey: string, webSearch: boolean, fetcher: typeof fetch = agentFetch): { model: LanguageModel; tools?: ToolSet } {
  const key = apiKey.trim()
  if (webSearch && record.provider === "openai") {
    const openai = createOpenAI({ apiKey: key, fetch: fetcher })
    return { model: openai.responses(record.endpoint), tools: { web_search: openai.tools.webSearch({}) } }
  }
  if (webSearch && record.provider === "gemini") {
    const google = createGoogleGenerativeAI({ apiKey: key, fetch: fetcher })
    return { model: google(record.endpoint), tools: { google_search: google.tools.googleSearch({}) } }
  }
  if (webSearch && record.provider === "openrouter" && !record.endpoint.endsWith(":online")) {
    return { model: studioModel({ ...record, endpoint: `${record.endpoint}:online` }, key, fetcher) }
  }
  return { model: studioModel(record, key, fetcher) }
}

/** Providers whose chat can search the web */
export const canSearchWeb = (provider: string): boolean => provider === "openai" || provider === "gemini" || provider === "openrouter"
