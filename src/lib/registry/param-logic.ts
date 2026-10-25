import type { ParamProperty, ParamSchema } from "./types"

/**
 * The rules that turn a model's own parameters into values the composer can hold, show, price and send.
 * Kept free of any screen code so they can be tested on their own.
 */

export type ParamValues = Record<string, unknown>

const isPlain = (v: unknown): v is string | number | boolean => ["string", "number", "boolean"].includes(typeof v)

/** The member of a list that equals the value, comparing "5" and 5 as the same choice. Returns that member, not the input. */
export function matchOption(options: ReadonlyArray<string | number>, value: unknown): string | number | undefined {
  return options.find((o) => o === value) ?? options.find((o) => isPlain(value) && String(o) === String(value))
}

/** The starting value for each field: the model's default when it is a real choice, otherwise the first option. */
export function defaultsFor(schema: ParamSchema): ParamValues {
  const out: ParamValues = {}
  for (const [key, p] of Object.entries(schema.properties)) {
    if (p.format) continue
    if (p.enum?.length) {
      // A default that is not one of the choices (some models give a size object, or a number for a text list) is not used
      out[key] = (isPlain(p.default) ? matchOption(p.enum, p.default) : undefined) ?? p.enum[0]
    } else if (isPlain(p.default)) {
      out[key] = clampNumber(p, p.default)
    }
  }
  return out
}

function clampNumber(p: ParamProperty, v: string | number | boolean): string | number | boolean {
  if (typeof v !== "number") return v
  return Math.min(p.maximum ?? Infinity, Math.max(p.minimum ?? -Infinity, v))
}

/** Keeps values that are still valid for the schema and resets the rest to defaults. */
export function clampToSchema(schema: ParamSchema, values: ParamValues): ParamValues {
  const defaults = defaultsFor(schema)
  const out: ParamValues = { ...defaults }
  for (const [key, p] of Object.entries(schema.properties)) {
    const v = values[key]
    if (v === undefined) continue
    if (p.enum?.length) {
      const hit = matchOption(p.enum, v)
      if (hit !== undefined) out[key] = hit
    } else if (typeof v === "number" && (p.type === "number" || p.type === "integer")) {
      if (v >= (p.minimum ?? -Infinity) && v <= (p.maximum ?? Infinity)) out[key] = v
    } else if (isPlain(v) && (typeof v === typeof defaults[key] || defaults[key] === undefined)) {
      out[key] = v
    }
  }
  return out
}

/**
 * The choices a row control offers. A model that gives a range (duration 1 to 15) is offered as a short list of
 * steps, and that list always holds the model's own default and the value now chosen, so what is selected is
 * always something the list shows.
 */
export function rowOptions(prop: ParamProperty, current?: unknown): Array<string | number> | undefined {
  if (prop.enum?.length) return prop.enum
  const { minimum: min, maximum: max } = prop
  if (min === undefined || max === undefined) return undefined
  const whole = prop.type === "integer" || Number.isInteger(min) && Number.isInteger(max)
  const base = max - min <= 12 && whole ? Array.from({ length: max - min + 1 }, (_, i) => min + i) : [min, 3, 5, 8, 10, 15, 20, 30, 45, 60, max].filter((n) => n >= min && n <= max)
  const extra = [prop.default, current].filter((v): v is number => typeof v === "number" && v >= min && v <= max)
  return [...new Set([...base, ...extra])].sort((a, b) => a - b)
}

/** Seconds from a duration choice. "auto", "" and anything unreadable give `fallback`, never NaN. */
export function secondsOf(values: ParamValues, fallback = 5): number {
  const raw = values.duration ?? values.duration_seconds ?? values.seconds
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? parseFloat(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** How many times the app runs a model that has no count field of its own. Under this name in the settings; never sent to a host. */
export const REPEAT_KEY = "__count"
export const MAX_REPEAT = 4

/** The times to run: the person's choice, one to MAX_REPEAT. Anything unreadable is one. */
export function repeatOf(values: ParamValues | undefined): number {
  const n = Number(values?.[REPEAT_KEY])
  return Number.isFinite(n) && n >= 1 ? Math.min(MAX_REPEAT, Math.floor(n)) : 1
}

/** How many results one run makes, from whichever field the model uses for it. */
export function countOf(values: ParamValues): number {
  const raw = values.num_images ?? values.n ?? values.num_outputs ?? values.sample_count ?? values.series_amount
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

const SIZE_PRESET: Record<string, string> = {
  square_hd: "1:1",
  square: "1:1",
  portrait_4_3: "3:4",
  portrait_16_9: "9:16",
  landscape_4_3: "4:3",
  landscape_16_9: "16:9",
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/** The picture shape as "w:h" (or "auto"), whether the model calls it an aspect ratio, a size preset, a width and height, or an object. */
export function aspectOf(values: ParamValues, fallback = "16:9"): string {
  const v = values.aspect_ratio ?? values.image_size ?? values.video_size ?? values.ratio ?? values.size
  if (typeof v === "string") {
    if (/^\d+:\d+$/.test(v) || v === "auto") return v
    if (SIZE_PRESET[v]) return SIZE_PRESET[v]!
    const wh = /^(\d+)\s*[x×]\s*(\d+)$/.exec(v)
    if (wh) {
      const w = Number(wh[1])
      const h = Number(wh[2])
      const d = gcd(w, h)
      return `${w / d}:${h / d}`
    }
  }
  if (v && typeof v === "object") {
    const { width, height } = v as { width?: number; height?: number }
    if (width && height) {
      const d = gcd(width, height)
      return `${width / d}:${height / d}`
    }
  }
  return fallback
}

const PRESET_MP: Record<string, number> = { square_hd: 1.05, square: 0.26, portrait_4_3: 0.79, portrait_16_9: 0.59, landscape_4_3: 0.79, landscape_16_9: 0.59 }
const TIER_MP: Record<string, number> = { "0.5k": 0.26, "512": 0.26, "1k": 1.05, "1024": 1.05, "2k": 4.19, "2048": 4.19, "4k": 16.78, "4096": 16.78 }

/** Megapixels of one picture from the size the person chose. One megapixel when nothing says otherwise. */
export function megapixelsOf(values: ParamValues): number {
  for (const key of ["resolution", "image_resolution", "image_size", "size", "quality"]) {
    const v = values[key]
    if (v && typeof v === "object") {
      const { width, height } = v as { width?: number; height?: number }
      if (width && height) return (width * height) / 1e6
    }
    if (typeof v !== "string") continue
    const s = v.toLowerCase().trim()
    if (PRESET_MP[s]) return PRESET_MP[s]!
    if (TIER_MP[s]) return TIER_MP[s]!
    const wh = /^(\d+)\s*[x×]\s*(\d+)$/.exec(s)
    if (wh) return (Number(wh[1]) * Number(wh[2])) / 1e6
  }
  return 1
}
