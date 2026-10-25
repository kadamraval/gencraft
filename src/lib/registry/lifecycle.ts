import { resolveLogoSlug } from "./logo-rules"
import type { ModelRecord } from "./types"

/**
 * Which models are current.
 *
 * A newer version of the same line replaces the older one: when Seedance 3 arrives, Seedance 2 is retired.
 * "Same line" means same host provider, same maker, same task and same variant words (pro, fast, turbo...),
 * so each tier keeps its own newest model. Models the provider has deprecated, or whose retirement date has
 * passed, are dropped without anyone touching them.
 *
 * Version detection reads the model name. When a name carries no version we cannot tell what replaces it,
 * so it stays listed: a stale model shown is better than a unique one hidden by a wrong guess.
 */

export const MAKER_LABEL: Record<string, string> = {
  kling: "Kling",
  hailuo: "Hailuo",
  minimax: "MiniMax",
  bytedance: "ByteDance",
  doubao: "ByteDance",
  alibaba: "Alibaba",
  google: "Google",
  gemini: "Google",
  nanobanana: "Google",
  sora: "OpenAI",
  openai: "OpenAI",
  luma: "Luma",
  runway: "Runway",
  pika: "Pika",
  pixverse: "PixVerse",
  vidu: "Vidu",
  hunyuan: "Tencent",
  cogvideo: "Zhipu",
  lightricks: "Lightricks",
  flux: "Black Forest Labs",
  midjourney: "Midjourney",
  ideogram: "Ideogram",
  recraft: "Recraft",
  stability: "Stability AI",
  topazlabs: "Topaz Labs",
  briaai: "Bria",
  krea: "Krea",
  kolors: "Kuaishou",
  decart: "Decart",
  sync: "Sync",
  hedra: "Hedra",
  elevenlabs: "ElevenLabs",
  suno: "Suno",
  udio: "Udio",
  claude: "Anthropic",
  grok: "xAI",
  meta: "Meta",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  qwen: "Alibaba",
  kimi: "Moonshot",
  zai: "Zhipu",
  stepfun: "StepFun",
  microsoft: "Microsoft",
  nvidia: "NVIDIA",
  longcat: "Meituan",
}

const GENERIC_WORDS = new Set([
  "text", "image", "video", "audio", "to", "reference", "edit", "editing", "generation", "generate", "api", "ai", "model",
  "new", "preview", "beta", "from", "with", "and", "of", "the", "i2v", "t2v", "v2v", "i2i", "t2i",
])

const NON_VERSION = /^\d+(p|k|b|m|s|x|fps|hz|khz|px|mp|gb)$/i

export interface ParsedName {
  /** Words that identify the line and its variant, without the version */
  words: string[]
  version?: number[]
}

function toVersion(text: string): number[] {
  return text.split(".").map((n) => Number(n))
}

/** Splits "Kling Video v2.6 Text to Video [Pro]" into variant words and a version. */
export function parseName(name: string): ParsedName {
  const tokens = name
    .toLowerCase()
    .replace(/[[\](){}:,/]+/g, " ")
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)

  let version: number[] | undefined
  const words: string[] = []

  for (const raw of tokens) {
    // "v2.6", "2.5", "4o", "4.1"
    const plain = raw.match(/^v?(\d+(?:\.\d+)*)([a-z]?)$/)
    // "flux.2", "veo3.1", "flux1.1", "o3", "sd3": the version is glued to the word
    const glued = raw.match(/^([a-z]+)\.?(\d+(?:\.\d+)*)$/)

    if (!version && plain && !NON_VERSION.test(raw) && !/^(19|20)\d\d$/.test(plain[1]!) && plain[1]!.length < 5) {
      version = toVersion(plain[1]!)
      continue
    }
    if (!version && glued && glued[1] !== "v" && glued[2]!.length < 5) {
      words.push(glued[1]!)
      version = toVersion(glued[2]!)
      continue
    }
    if (GENERIC_WORDS.has(raw)) continue
    words.push(raw)
  }
  return { words, version }
}

export function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d) return d
  }
  return 0
}

export function makerOf(r: Pick<ModelRecord, "name" | "endpoint" | "family" | "provider">): string {
  const slug = resolveLogoSlug({ name: r.name, endpoint: r.endpoint, family: r.family })
  if (slug && MAKER_LABEL[slug]) return MAKER_LABEL[slug]!
  const owner = r.endpoint.split("/")[0] ?? r.provider
  return owner === "fal-ai" ? "fal" : owner.replace(/(^|-)([a-z])/g, (_m, sep: string, c: string) => `${sep ? " " : ""}${c.toUpperCase()}`)
}

function lineKey(r: ModelRecord, words: string[]): string {
  const slug = resolveLogoSlug({ name: r.name, endpoint: r.endpoint, family: r.family }) ?? r.endpoint.split("/")[0]
  return [r.provider, slug, r.task ?? r.modality, words.join(" ")].join("|")
}

/** The provider's own wording: "Previous image model", "Legacy GPT model", "Deprecated large model", "succeeded by GPT-5". */
export function isOutdatedDescription(description: string | undefined): boolean {
  return /\b(previous|previous-generation|legacy|older|deprecated|succeeded by|superseded)\b/i.test(description ?? "")
}

export function isRetired(r: ModelRecord, now = Date.now()): boolean {
  if (r.status === "deprecated") return true
  return r.retiresAt ? Date.parse(r.retiresAt) <= now : false
}

/** Fills maker, version, and `supersededBy`, and marks models whose retirement date has passed. */
export function applyLifecycle(records: ModelRecord[], now = Date.now()): ModelRecord[] {
  const parsed = records.map((r) => ({ r, ...parseName(r.name) }))
  const lines = new Map<string, Array<{ r: ModelRecord; version: number[] }>>()
  for (const p of parsed) {
    if (!p.version || isRetired(p.r, now)) continue
    const key = lineKey(p.r, p.words)
    const list = lines.get(key) ?? []
    list.push({ r: p.r, version: p.version })
    lines.set(key, list)
  }

  const supersededBy = new Map<string, string>()
  for (const list of lines.values()) {
    if (list.length < 2) continue
    const newest = list.reduce((a, b) => (compareVersions(b.version, a.version) > 0 ? b : a))
    for (const item of list) {
      if (compareVersions(item.version, newest.version) < 0) supersededBy.set(item.r.id, newest.r.id)
    }
  }

  return parsed.map(({ r, version }) => ({
    ...r,
    maker: r.maker ?? makerOf(r),
    version,
    supersededBy: supersededBy.get(r.id),
    status: isRetired(r, now) ? "deprecated" : r.status,
  }))
}

/** Shown in the picker and the settings list: current, still working, not about to disappear unannounced. */
export function isListed(r: ModelRecord, now = Date.now()): boolean {
  // A model with an announced shutdown date is not offered for new work; projects already using it get a warning
  // "(batch)" entries are the same model on a different billing path, not a model of their own
  return !isRetired(r, now) && !r.supersededBy && !r.outdated && !r.retiresAt && !/\(batch\)\s*$/i.test(r.name)
}

export interface LifecycleWarning {
  kind: "retiring" | "retired" | "superseded"
  text: string
}

/** For a model a project still uses: what is happening to it and what to switch to. */
export function lifecycleWarning(r: ModelRecord, byId: (id: string) => ModelRecord | undefined, now = Date.now()): LifecycleWarning | null {
  const replacement = r.supersededBy ? byId(r.supersededBy)?.name : undefined
  const switchTo = replacement ? `, switch to ${replacement}` : ""
  if (isRetired(r, now)) return { kind: "retired", text: `Retired${r.retiresAt ? ` on ${r.retiresAt.slice(0, 10)}` : ""}${switchTo}` }
  if (r.retiresAt) {
    const days = Math.ceil((Date.parse(r.retiresAt) - now) / 86_400_000)
    return { kind: "retiring", text: `Retires ${r.retiresAt.slice(0, 10)} (${days} days)${switchTo}` }
  }
  if (r.supersededBy || r.outdated) return { kind: "superseded", text: `Older version${switchTo}` }
  return null
}
