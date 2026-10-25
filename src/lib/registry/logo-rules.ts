/**
 * Logo strategy: show the MAKER of a model, not the host that serves it.
 *
 * fal puts 910 of its 1181 models under the `fal-ai` namespace and OpenRouter proxies hundreds of vendors,
 * so the endpoint prefix is useless on its own. Instead we scan the model name + endpoint path for a known
 * brand keyword (most specific first), then fall back to the serving provider, then to a monogram.
 *
 * Brand SVGs are bundled from @lobehub/icons-static-svg by `npm run logos:sync`, which reads this file.
 */

export interface LogoRule {
  /** Matched against the lowercase haystack (name + endpoint, minus the fal-ai namespace) */
  match: RegExp
  slug: string
}

export const LOGO_RULES: LogoRule[] = [
  // video makers
  { match: /kling/, slug: "kling" },
  { match: /hailuo/, slug: "hailuo" },
  { match: /minimax|\bmini-?max\b/, slug: "minimax" },
  { match: /seedance|seedream|bytedance|doubao|byte-?dance/, slug: "bytedance" },
  { match: /jimeng/, slug: "doubao" },
  { match: /\bwan\b|wan[-_ ]?\d|alibaba|tongyi/, slug: "alibaba" },
  { match: /\bveo\b|veo[-_ ]?\d|imagen/, slug: "google" },
  { match: /sora/, slug: "sora" },
  { match: /luma|ray[-_ ]?\d|dream-machine/, slug: "luma" },
  { match: /runway|gen[-_ ]?[34]/, slug: "runway" },
  { match: /pika/, slug: "pika" },
  { match: /pixverse/, slug: "pixverse" },
  { match: /vidu/, slug: "vidu" },
  { match: /hunyuan|tencent/, slug: "hunyuan" },
  { match: /cogvideo|cogview/, slug: "cogvideo" },
  { match: /ltx|lightricks/, slug: "lightricks" },
  { match: /higgsfield/, slug: "higgsfield" },
  // image makers
  { match: /nano[-_ ]?banana/, slug: "nanobanana" },
  { match: /flux|black-?forest|\bbfl\b/, slug: "flux" },
  { match: /midjourney/, slug: "midjourney" },
  { match: /ideogram/, slug: "ideogram" },
  { match: /recraft/, slug: "recraft" },
  { match: /stable[-_ ]?(?:diffusion|audio|video|image|fast)|stability|sdxl|sd3|\bsd[-_]?\d/, slug: "stability" },
  { match: /topaz/, slug: "topazlabs" },
  { match: /bria/, slug: "briaai" },
  { match: /krea/, slug: "krea" },
  { match: /kolors|kwai/, slug: "kolors" },
  { match: /decart/, slug: "decart" },
  { match: /microsoft|mai-image|florence|phi-?\d/, slug: "microsoft" },
  { match: /nvidia|cosmos/, slug: "nvidia" },
  { match: /longcat/, slug: "longcat" },
  { match: /z-image|zimage/, slug: "alibaba" },
  { match: /seedvr/, slug: "bytedance" },
  { match: /sam-?[23]/, slug: "meta" },
  { match: /(^|[^a-z])sync([^a-z]|$)|lipsync/, slug: "sync" },
  { match: /hedra/, slug: "hedra" },
  { match: /meshy/, slug: "meshy" },
  { match: /tripo/, slug: "tripo" },
  // audio
  { match: /elevenlabs|eleven-?labs/, slug: "elevenlabs" },
  { match: /suno/, slug: "suno" },
  { match: /udio/, slug: "udio" },
  // language models and general vendors
  { match: /gemini|gemma/, slug: "gemini" },
  { match: /anthropic|claude/, slug: "claude" },
  { match: /openai|gpt|dall-?e|whisper|\bo[134]\b|chatgpt/, slug: "openai" },
  { match: /grok|x-ai|\bxai\b/, slug: "grok" },
  { match: /llama|meta-llama|\bmeta\b/, slug: "meta" },
  { match: /mistral|mixtral|codestral/, slug: "mistral" },
  { match: /deepseek/, slug: "deepseek" },
  { match: /qwen/, slug: "qwen" },
  { match: /moonshot|kimi/, slug: "kimi" },
  { match: /z-ai|zhipu|\bglm\b/, slug: "zai" },
  { match: /stepfun|step-\d/, slug: "stepfun" },
  { match: /google/, slug: "google" },
]

/** Serving providers: used only when no maker keyword matched. */
export const PROVIDER_SLUGS: Record<string, string> = {
  fal: "fal",
  replicate: "replicate",
  openrouter: "openrouter",
  gemini: "gemini",
  openai: "openai",
  runway: "runway",
  kling: "kling",
  comfyui: "comfyui",
}

/** Slugs whose mono SVG is the only variant. Everything else prefers `-color`. */
export const ALL_SLUGS: string[] = [...new Set([...LOGO_RULES.map((r) => r.slug), ...Object.values(PROVIDER_SLUGS)])]

export interface LogoSubject {
  name?: string
  endpoint?: string
  family?: string
  provider?: string
}

/** Every keyword must start at a word boundary, so "kling" does not match "Inkling" or "udio" match "audio". */
const COMPILED_RULES = LOGO_RULES.map((r) => ({ slug: r.slug, re: new RegExp(`(?:^|[^a-z0-9])(?:${r.match.source})`) }))

export function resolveLogoSlug(subject: LogoSubject): string | null {
  const hay = `${subject.name ?? ""} ${subject.endpoint ?? ""} ${subject.family ?? ""}`
    .toLowerCase()
    .replace(/\bfal-ai\b|\bfal\b/g, " ")
  for (const rule of COMPILED_RULES) if (rule.re.test(hay)) return rule.slug
  const provider = subject.provider ? PROVIDER_SLUGS[subject.provider] : undefined
  return provider ?? null
}

/** Makers users reach for first, per modality. Earlier entries rank higher in the picker. */
const MAKER_PRIORITY: Record<string, string[]> = {
  text: ["claude", "openai", "gemini", "grok", "deepseek", "qwen", "meta", "mistral", "kimi", "zai"],
  image: ["nanobanana", "flux", "openai", "bytedance", "midjourney", "ideogram", "recraft", "google", "stability", "alibaba"],
  video: ["kling", "google", "sora", "bytedance", "alibaba", "hailuo", "minimax", "luma", "runway", "pixverse", "vidu"],
  audio: ["elevenlabs", "suno", "udio", "stability", "openai"],
}

export function makerRank(subject: LogoSubject, modality: string = "video"): number {
  const order = MAKER_PRIORITY[modality] ?? []
  const slug = resolveLogoSlug({ ...subject, provider: undefined })
  const i = slug ? order.indexOf(slug) : -1
  return i === -1 ? order.length : i
}

/** A maker people reach for first in this kind of output. Newest-release lists skip everyone else, so fine-tunes and one-offs do not crowd them. */
export function isLeadingMaker(subject: LogoSubject, modality: string = "video"): boolean {
  return makerRank(subject, modality) < (MAKER_PRIORITY[modality]?.length ?? 0)
}
