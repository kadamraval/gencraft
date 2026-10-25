import type { ModelRecord, RegistryModality } from "./types"

/**
 * The makers and product lines the app supports. Everything else is left out of the app.
 *
 * A line names one maker's product (Kling video, FLUX images, Claude chat) and how to recognise its endpoints.
 * Inside a line the newest models are kept, so a new version of a watched line appears by itself. Only a new
 * maker or product line needs an edit here; the registry build reports models that match no line.
 */
export interface Line {
  id: string
  maker: string
  name: string
  modality: RegistryModality
  /** Tested against the lower-case provider endpoint */
  match: RegExp
  /** Endpoints that match but are not the line's own models (adapters, variants of no use here) */
  skip?: RegExp
  /** The most models kept from this line, newest first */
  cap?: number
}

const DEFAULT_CAP = 12
const CHAT_CAP = 6
/** Copies of a chat model that add nothing: batch queues, free tiers, rolling aliases, safety classifiers */
const CHAT_SKIP = /:batch|:free|:extended|:thinking|^~|\/~|-contributor|safety|guard|embed|moderation|-preview-\d{2}-\d{2}$/

const image = (id: string, maker: string, name: string, match: RegExp, skip?: RegExp, cap?: number): Line => ({ id, maker, name, modality: "image", match, skip, cap })
const video = (id: string, maker: string, name: string, match: RegExp, skip?: RegExp, cap?: number): Line => ({ id, maker, name, modality: "video", match, skip, cap })
const audio = (id: string, maker: string, name: string, match: RegExp, skip?: RegExp, cap?: number): Line => ({ id, maker, name, modality: "audio", match, skip, cap })
const chat = (id: string, maker: string, name: string, match: RegExp): Line => ({ id, maker, name, modality: "text", match, skip: CHAT_SKIP, cap: CHAT_CAP })

export const WATCHLIST: Line[] = [
  // Image
  image("flux", "Black Forest Labs", "FLUX", /(^|\/)(flux)/, /lora|control|general|rundiffusion|video|action|upscale|fill|redux/, 14),
  image("gemini-image", "Google", "Gemini image and Nano Banana", /nano-banana|gemini-[\d.]+(-[a-z]+)*-image|imagen/),
  image("gpt-image", "OpenAI", "GPT Image", /gpt-image|gpt-[\d.]+(-[a-z]+)?-image/),
  image("seedream", "ByteDance", "Seedream", /seedream/),
  image("qwen-image", "Alibaba", "Qwen Image", /qwen-image/, /lora|layered|multiple-angles/),
  image("z-image", "Alibaba", "Z-Image", /z-image/, /lora/),
  image("wan-image", "Alibaba", "Wan image", /wan.*to-image/),
  image("recraft", "Recraft", "Recraft", /recraft/, /vector|styles|utility/),
  image("ideogram", "Ideogram", "Ideogram", /ideogram/),
  image("stable-diffusion", "Stability AI", "Stable Diffusion", /stable-diffusion-v3|stable-diffusion-3|(^|\/)sd3/, /lora|control/),
  image("hunyuan-image", "Tencent", "Hunyuan image", /hunyuan-image|hy-image/),
  image("grok-image", "xAI", "Grok image", /grok-imagine-image|grok-\d+-image/),
  image("kling-image", "Kling", "Kling image", /kling-image/),
  image("luma-photon", "Luma", "Luma Photon", /luma-photon|luma\/photon/),
  image("krea", "Krea", "Krea", /(^|\/)krea/, /wan|lora/),
  image("fibo", "Bria", "Bria FIBO", /bria\/fibo/, /edit|bbq|virtual/),
  image("mai-image", "Microsoft", "MAI Image", /mai-image/),
  image("minimax-image", "MiniMax", "MiniMax image", /minimax\/image/),
  image("topaz-upscale", "Topaz Labs", "Topaz upscale", /topaz\/upscale/),

  // Video
  video("kling", "Kling", "Kling", /kling(-video|-v\d)/, /lora|effects|avatar|lipsync/, 18),
  video("veo", "Google", "Veo", /(^|\/)veo/),
  video("sora", "OpenAI", "Sora", /sora/),
  video("seedance", "ByteDance", "Seedance", /seedance/, undefined, 14),
  video("wan", "Alibaba", "Wan", /(^|\/)wan(-|\/|$)/, /lora|vace|effects|motion|animate|krea|-image/, 18),
  video("hailuo", "MiniMax", "Hailuo and MiniMax video", /minimax\/(hailuo|h3|video)|minimax-video|hailuo/, undefined, 14),
  video("luma-ray", "Luma", "Luma Ray", /luma-dream-machine|(^|\/)ray-?\d|luma\/ray/),
  video("pika", "Pika", "Pika", /(^|\/)pika/),
  video("pixverse", "PixVerse", "PixVerse", /pixverse/),
  video("vidu", "Vidu", "Vidu", /vidu/, /image|lora/, 10),
  video("ltx", "Lightricks", "LTX", /(^|\/)ltx/, /lora|distilled|13b/, 10),
  video("hunyuan-video", "Tencent", "Hunyuan video", /hunyuan-video/, /lora|foley/),
  video("grok-video", "xAI", "Grok video", /grok-imagine-video/),
  video("marey", "Moonvalley", "Moonvalley Marey", /moonvalley/),
  video("lipsync", "Sync", "Lip-sync", /sync-lipsync|veed\/fabric|lipsync/),

  // Audio
  audio("elevenlabs", "ElevenLabs", "ElevenLabs", /elevenlabs/),
  audio("minimax-audio", "MiniMax", "MiniMax speech and music", /minimax(\/|-)(speech|music|voice)|minimax-music|minimax\/music/),
  audio("google-audio", "Google", "Gemini speech and Lyria", /lyria|gemini-[\d.]+(-[a-z]+)*-tts/),
  audio("openai-speech", "OpenAI", "OpenAI speech", /^(gpt-[\w.-]*tts|tts-1)/),
  audio("stable-audio", "Stability AI", "Stable Audio", /stable-audio/),
  audio("mureka", "Mureka", "Mureka", /mureka/),
  audio("qwen-tts", "Alibaba", "Qwen speech", /qwen.*tts/),
  audio("xai-speech", "xAI", "Grok speech", /xai\/tts/),

  // Chat
  chat("chat-openai", "OpenAI", "GPT", /(^|\/)(gpt-|o\d)/),
  chat("chat-anthropic", "Anthropic", "Claude", /anthropic\/claude|(^|\/)claude/),
  chat("chat-google", "Google", "Gemini", /(^|\/)gemini/),
  chat("chat-xai", "xAI", "Grok", /x-ai\/grok|(^|\/)grok/),
  chat("chat-deepseek", "DeepSeek", "DeepSeek", /deepseek/),
  chat("chat-qwen", "Alibaba", "Qwen", /(^|\/)qwen/),
  chat("chat-meta", "Meta", "Meta Llama and Muse", /^meta\/|llama/),
  chat("chat-mistral", "Mistral", "Mistral", /mistralai/),
  chat("chat-kimi", "Moonshot", "Kimi", /moonshotai\/kimi/),
  chat("chat-glm", "Zhipu", "GLM", /(z-ai|zai-org)\/glm/),
  chat("chat-minimax", "MiniMax", "MiniMax chat", /minimax\/minimax-m/),
]

export function lineOf(record: Pick<ModelRecord, "endpoint" | "modality">): Line | undefined {
  const e = record.endpoint.toLowerCase()
  return WATCHLIST.find((l) => l.modality === record.modality && l.match.test(e) && !(l.skip && l.skip.test(e)))
}

/** The version in the name when the registry could not parse one: "wan/v2.7/...", "wan-3.0/...", "kling-video/v2.5-turbo/..." */
function versionFromEndpoint(endpoint: string): number[] {
  const m = endpoint.toLowerCase().match(/(?:^|[/-])v?(\d+(?:\.\d+)?)(?=$|[/-])/)
  return m ? m[1]!.split(".").map(Number) : []
}

const rank = (r: ModelRecord): number => {
  const v = r.version?.length ? r.version : versionFromEndpoint(r.endpoint)
  return v.reduce((sum, n, i) => sum + n / 100 ** i, 0)
}

/**
 * The models the app keeps: for every line, the newest ones. Version decides first; the provider's own
 * update date breaks ties and orders models whose names carry no version.
 *
 * The limit applies to each provider on its own. A person with only a Replicate key must still get the newest
 * Replicate models of every line, however many models another provider has in the same line.
 */
export function selectWatched(records: ModelRecord[]): { kept: ModelRecord[]; unmatched: ModelRecord[] } {
  const groups = new Map<string, { line: Line; items: ModelRecord[] }>()
  const unmatched: ModelRecord[] = []
  for (const r of records) {
    const line = lineOf(r)
    if (!line) {
      unmatched.push(r)
      continue
    }
    const key = `${r.provider}|${line.id}`
    const group = groups.get(key) ?? { line, items: [] }
    group.items.push(r)
    groups.set(key, group)
  }
  const kept: ModelRecord[] = []
  for (const { line, items } of groups.values()) {
    const cap = line.cap ?? DEFAULT_CAP
    const ordered = [...items].sort((a, b) => rank(b) - rank(a) || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    kept.push(...ordered.slice(0, cap))
  }
  return { kept, unmatched }
}
