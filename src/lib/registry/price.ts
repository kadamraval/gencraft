import { factFor, speechSeconds } from "../models/pricing-facts"
import { audioSwitchKey } from "./canonical"
import { calibrationFor } from "./calibration"
import { countOf, defaultsFor, megapixelsOf, secondsOf } from "./param-logic"
import type { ModelRecord, PriceRule } from "./types"

/**
 * What one run costs.
 *
 * A host bills in its own unit (per second, per clip, per image, per thousand characters, per token) and often by tier
 * (resolution, sound, input video, quality). This turns the host's rules and the settings chosen in the composer into a
 * price for that run, and says how sure it is:
 *  - exact: every condition of the price was answered by the settings;
 *  - `from`: the settings do not say which tier applies, so this is the lowest it could be;
 *  - `upTo`: the model picks the length, so this is the most it could be;
 *  - `approximate`: a projection (a token price, a bundled estimate).
 */

export interface PriceContext {
  /** A video goes in (some prices differ when one does) */
  sourceVideo?: boolean
  /** The characters of the text to be spoken, for per-character prices */
  promptChars?: number
}

export interface PriceEstimate {
  usd: number | null
  display: string
  /** True when the number is a rough projection (token pricing, unknown unit, bundled estimate). */
  approximate: boolean
  from?: boolean
  upTo?: boolean
  /** The working, for a tooltip: "5 s × $0.10/s" */
  breakdown?: string
  /** The learned correction that was applied, when there is one (the bill came out this many times the price list's figure) */
  calibration?: number
}

function fmt(usd: number): string {
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

/** The most specific rule whose every condition matches the chosen parameters wins. */
export function matchRule(rules: PriceRule[] | undefined, values: Record<string, unknown>): PriceRule | undefined {
  let best: PriceRule | undefined
  let bestSize = -1
  for (const rule of rules ?? []) {
    const keys = Object.keys(rule.when)
    const ok = keys.every((k) => String(values[k]).toLowerCase() === String(rule.when[k]).toLowerCase())
    if (ok && keys.length > bestSize) {
      best = rule
      bestSize = keys.length
    }
  }
  return best
}

const norm = (v: unknown): string => String(v).trim().toLowerCase().replace(/[\s-]+/g, "_")

/** 6 and "6" are the same length; "768P" and "768p" are the same size. */
function same(a: unknown, b: unknown): boolean {
  const x = Number(a)
  const y = Number(b)
  if (String(a).trim() !== "" && String(b).trim() !== "" && Number.isFinite(x) && Number.isFinite(y)) return x === y
  return norm(a) === norm(b)
}

type Answer = { known: false } | { known: true; value: unknown }

/**
 * Hosts file different things under "model variant": whether a video goes in, sound on or off, a quality, a mode. The
 * settings answer it where a field of the model has these very choices, or where the composer knows (a video attached).
 */
function resolveVariant(rec: ModelRecord, variants: string[], values: Record<string, unknown>, ctx: PriceContext): Answer {
  const v = variants.map(norm)
  if (v.length <= 1) return { known: true, value: v[0] }
  const withVideo = v.filter((x) => /video_in|video_input|^v2v/.test(x) && !/^non_/.test(x))
  const without = v.filter((x) => /^non_video_in|^t2v|^base$/.test(x))
  if (ctx.sourceVideo !== undefined && withVideo.length > 0 && without.length > 0) return { known: true, value: ctx.sourceVideo ? withVideo[0] : without[0] }
  const audio = v.filter((x) => /^(with|without)_audio$/.test(x))
  if (audio.length === 2) return { known: true, value: values.generate_audio === false ? "without_audio" : "with_audio" }
  for (const [key, p] of Object.entries(rec.params.properties)) {
    if (!p.enum?.length) continue
    const choices = new Set(p.enum.map(norm))
    const shared = v.filter((x) => choices.has(x)).length
    if (shared >= Math.max(2, Math.ceil(v.length / 2))) return { known: true, value: norm(values[key] ?? p.default) }
  }
  return { known: false }
}

/** The length to bill: a model that picks its own length is priced at the most it could run. */
function billableSeconds(rec: ModelRecord, values: Record<string, unknown>): { seconds: number; auto: boolean } {
  const raw = values.duration ?? values.duration_seconds ?? values.seconds
  const auto = raw === "auto" || (typeof raw === "number" && raw <= 0) || (typeof raw === "string" && /^(auto|-1|0)$/i.test(raw.trim()))
  return auto ? { seconds: rec.summary?.maxSeconds ?? 10, auto: true } : { seconds: secondsOf(values), auto: false }
}

/** The rule that applies, and whether the settings left the tier open (then the lowest of the open ones is taken). */
function pickRule(rec: ModelRecord, values: Record<string, unknown>, ctx: PriceContext, seconds: number): { rule?: PriceRule; from: boolean } {
  const rules = rec.price.rules ?? []
  if (rules.length === 0) return { from: false }
  const variants = [...new Set(rules.map((r) => r.when.model_variant).filter((x) => x !== undefined).map(String))]
  const variant = variants.length > 0 ? resolveVariant(rec, variants, values, ctx) : undefined
  const exact: PriceRule[] = []
  const open: PriceRule[] = []
  for (const rule of rules) {
    let rejected = false
    let undecided = false
    for (const [key, want] of Object.entries(rule.when)) {
      const answer: Answer = key === "model_variant" ? variant! : key === "second_of_output_video" ? { known: true, value: seconds } : key in values ? { known: true, value: values[key] } : { known: false }
      if (!answer.known) undecided = true
      else if (!same(answer.value, want)) {
        rejected = true
        break
      }
    }
    if (rejected) continue
    ;(undecided ? open : exact).push(rule)
  }
  if (exact.length > 0) return { rule: exact.reduce((a, b) => (Object.keys(b.when).length > Object.keys(a.when).length ? b : a)), from: false }
  if (open.length > 0) return { rule: open.reduce((a, b) => (b.amount < a.amount ? b : a)), from: true }
  return { from: true }
}

/** Estimates one generation from the model price unit and the parameter values chosen in the composer. */
export function estimateRun(rec: ModelRecord, chosen: Record<string, unknown>, context: PriceContext = {}): PriceEstimate {
  // Price rules are written against one name for the audio switch; models name it differently
  const alias = audioSwitchKey(rec.params.properties)
  const values = alias && alias !== "generate_audio" && !("generate_audio" in chosen) ? { ...chosen, generate_audio: chosen[alias] } : chosen
  const { unit, source } = rec.price
  const { seconds, auto } = billableSeconds(rec, values)
  const { rule, from } = pickRule(rec, values, context, seconds)
  const amount = rule?.amount ?? rec.price.amount
  if (amount === null) return { usd: null, display: rec.price.computeSecond ? `$${rec.price.computeSecond}/compute sec` : "—", approximate: true, breakdown: rec.price.computeSecond ? "billed by the seconds the run takes" : undefined }

  const images = countOf(values)
  let usd: number
  let approximate = source === "estimate"
  let breakdown: string
  let upTo = false
  switch (unit) {
    case "per_image":
      usd = amount * images
      breakdown = `${images} image${images === 1 ? "" : "s"} × ${fmt(amount)}`
      break
    case "per_second":
      usd = amount * seconds
      upTo = auto
      breakdown = `${seconds} s × ${fmt(amount)}/s`
      break
    case "per_megapixel":
      // Billed by size: the megapixels of the chosen resolution or size, for each image
      usd = amount * megapixelsOf(values) * images
      approximate = true
      breakdown = `${megapixelsOf(values).toFixed(1)} MP × ${fmt(amount)}/MP`
      break
    case "per_1k_chars": {
      const chars = context.promptChars ?? 500
      usd = amount * (chars / 1000) * (rec.modality === "image" ? images : 1)
      approximate = context.promptChars === undefined || approximate
      breakdown = `${chars.toLocaleString("en-US")} characters × ${fmt(amount)}/1K`
      break
    }
    case "per_1m_tokens": {
      if (rec.modality === "text") {
        // A chat turn is estimated at about 1k tokens in and 1k out, using the exact input and output rates
        usd = (amount * 1000 + (rec.price.outputAmount ?? amount) * 1000) / 1_000_000
        approximate = true
        breakdown = "about 1K tokens in and 1K out"
        break
      }
      const key = `${rec.provider}/${rec.endpoint}`
      const rate = rec.price.outputAmount ?? amount
      if (rec.modality === "image") {
        const bySize = factFor(key, "image-by-size")
        const fact = bySize ?? factFor(key, "image-by-quality")
        // Sized models are billed by the size asked for; with none chosen, the smallest size is the standard run
        const sizeKey = norm(values.image_size ?? values.resolution ?? values.size ?? "")
        const sizes = Object.keys(bySize?.imageTokens ?? {})
        const tokens = bySize ? bySize.imageTokens?.[sizes.includes(sizeKey) ? sizeKey : sizes[0]!] : fact?.imageTokens?.[norm(values.quality ?? "")]
        if (!tokens) return { usd: null, display: "per image token", approximate: true }
        usd = (tokens * rate * images) / 1_000_000
        breakdown = `${tokens.toLocaleString("en-US")} tokens × ${fmt(rate)}/M`
      } else {
        const fact = factFor(key, rec.modality === "video" ? "video-per-second" : "audio-per-second")
        if (!fact?.tokensPerSecond) return { usd: null, display: "per token", approximate: true }
        const secs = rec.modality === "audio" ? speechSeconds(context.promptChars ?? 500) : seconds
        usd = (secs * fact.tokensPerSecond * rate) / 1_000_000
        upTo = rec.modality === "video" && auto
        breakdown = `${secs} s × ${fact.tokensPerSecond.toLocaleString("en-US")} tokens/s × ${fmt(rate)}/M`
      }
      approximate = true
      break
    }
    case "per_megapixel_second": {
      // Billed by the size and the length of the video: the megapixels of the chosen resolution (1080p when none is chosen) for each second
      const mp = megapixelsOf(values) || 2.07
      usd = amount * mp * seconds
      approximate = true
      upTo = auto
      breakdown = `${seconds} s × ${mp.toFixed(1)} MP × ${fmt(amount)}/MP·s`
      break
    }
    case "per_frame": {
      // Billed by the frames of the video: the length times the frame rate (30 a second when none is chosen)
      const fps = Number(values.fps ?? values.frame_rate ?? 30) || 30
      usd = amount * seconds * fps
      approximate = true
      upTo = auto
      breakdown = `${seconds} s × ${fps} fps × ${fmt(amount)}/frame`
      break
    }
    case "per_minute":
      usd = (amount * seconds) / 60
      approximate = true
      breakdown = `${seconds} s × ${fmt(amount)}/min`
      break
    default:
      usd = amount * (rec.modality === "image" ? images : 1)
      // A model billed by the seconds it runs: the price is what a run typically costs, so it is a projection
      if (rec.price.computeSecond) approximate = true
      breakdown = rec.price.computeSecond ? `a typical run (${fmt(amount)}), billed by run time` : rec.modality === "image" ? `${images} × ${fmt(amount)}` : "one run"
  }
  // What this model's bills have turned out to be against the price list (learned from the provider's own billing)
  const learned = calibrationFor(rec)
  if (learned) {
    usd *= learned
    approximate = true
    breakdown = `${breakdown} × ${learned.toFixed(2)} (what your bills came to)`
  }
  const prefix = `${upTo ? "up to " : ""}${from ? "from " : ""}${approximate ? "~" : ""}`
  return { usd, display: `${prefix}${fmt(usd)}`, approximate, from: from || undefined, upTo: upTo || undefined, breakdown, calibration: learned ?? undefined }
}

/**
 * The price of the run most people make, for a row: the model's own defaults, with a length of 5 seconds when the model
 * leaves it open, one image, a thousand characters of speech. `label` says what that run is ("5 s · 1080p").
 */
export function standardRun(rec: ModelRecord): { estimate: PriceEstimate; label: string } {
  const values: Record<string, unknown> = { ...defaultsFor(rec.params) }
  const raw = values.duration ?? values.duration_seconds ?? values.seconds
  const open = raw === undefined || raw === "auto" || (typeof raw === "number" && raw <= 0) || (typeof raw === "string" && /^(auto|-1|0)$/i.test(raw.trim()))
  const key = (["duration", "duration_seconds", "seconds"] as const).find((k) => k in rec.params.properties) ?? "duration"
  if (rec.modality === "video" && open) values[key] = rec.summary?.maxSeconds && rec.summary.maxSeconds < 5 ? rec.summary.maxSeconds : 5
  const promptChars = rec.price.unit === "per_1k_chars" || (rec.modality === "audio" && rec.price.unit === "per_1m_tokens") ? 1000 : undefined
  const estimate = estimateRun(rec, values, { promptChars })
  const parts: string[] = []
  if (rec.modality === "video") parts.push(`${secondsOf(values)} s`)
  if (rec.modality === "image") parts.push("1 image")
  if (promptChars) parts.push("1K characters")
  if (rec.modality === "audio" && rec.price.unit === "per_run") parts.push("1 file")
  if (rec.modality === "audio" && rec.price.unit === "per_minute") parts.push("1 min")
  const size = values.resolution ?? values.image_size ?? values.size
  if (typeof size === "string" && size && !/^(auto|adaptive)$/i.test(size)) parts.push(size)
  return { estimate, label: parts.join(" · ") }
}
