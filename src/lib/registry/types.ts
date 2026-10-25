export type RegistryModality = "text" | "image" | "video" | "audio"

export type PriceUnit = "per_image" | "per_second" | "per_run" | "per_1m_tokens" | "per_megapixel" | "per_1k_chars" | "per_minute" | "per_megapixel_second" | "per_frame" | "unknown"

/** The model's own safety checker field, when it has one. Absent means the provider filters on its side and it cannot be changed. */
export interface SafetyControl {
  key: string
  kind: "enable" | "disable" | "tolerance"
  /** Tolerance scales: the steps the model accepts */
  values?: Array<string | number>
}

/** How to build a complete request for the model: which field takes the prompt, defaults for other required fields, and what cannot be filled */
export interface RequestSpec {
  promptKey: string
  fixed: Record<string, unknown>
  blockers: string[]
  /** Which version of the reader made this record; older ones are read again */
  v?: number
}

export interface ParamSchema {
  type: "object"
  properties: Record<string, ParamProperty>
  required?: string[]
  safety?: SafetyControl
  request?: RequestSpec
}

export type RefSlotRole = "start" | "end" | "reference" | "source" | "element"

export interface RefSlot {
  kind: "image" | "video" | "audio"
  role: RefSlotRole
  list: boolean
  /** Files it takes. Null when the provider does not say. */
  max: number | null
  /** The stated limit is shared with other slots ("7 in total") */
  shared?: boolean
  /** Items are objects (Kling elements), not plain addresses */
  objectItems?: boolean
}

export interface RefSummary {
  images: number
  start: boolean
  end: boolean
  videos: number
  audios: number
  elements: boolean
  /** False when the provider did not state the image limit */
  stated: boolean
}

export interface ParamProperty {
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object"
  title?: string
  description?: string
  enum?: Array<string | number>
  default?: string | number | boolean
  minimum?: number
  maximum?: number
  /** Marks a property as an image/video/audio upload slot (set by adapters) */
  format?: "image" | "video" | "audio"
  /** What the slot is for (start frame, reference list, ...) and how many files it takes */
  slot?: RefSlot
  /**
   * common: every model in the mode gets it (aspect, duration, resolution, count, audio).
   * unique: a model-specific control that really matters (camera, style, voice, edit strength).
   * advanced: lives under More (seed, negative prompt, prompt enhancer).
   * technical: the provider's own low-level settings (steps, output format, frame rate). Listed, never hidden.
   */
  tier?: "common" | "unique" | "advanced" | "technical"
  /** The maker documents it but the provider's own list lacks it: shown, and sent only once changed, until a run proves it works there */
  untested?: boolean
  /** A run showed the provider refuses it. Kept in the list so the record is honest, never offered or sent. */
  rejected?: boolean
  /** Which other provider lists this setting for the same model (set when it was added from there) */
  listedBy?: string
  /** A control that shapes the prompt and is never sent as a field of its own (Multi-shot writes the prompt as a storyboard) */
  virtual?: boolean
}

/** A price that depends on a parameter, e.g. audio on costs more than audio off. */
export interface PriceRule {
  when: Record<string, string | number | boolean>
  amount: number
}

/** A price the user corrected. It is kept as written across every refresh; a notice appears if the provider's own number moves. */
export interface PriceOverride {
  unit: PriceUnit
  amount: number
  /** Token models: the output rate per 1M tokens */
  outputAmount?: number
  editedAt: string
  /** What the provider's own price was when the user edited, to notice a later change */
  providerAmount: number | null
}

export interface ModelPrice {
  unit: PriceUnit
  amount: number | null
  /** Token pricing: the output rate per 1M tokens, when it differs from `amount` (the input rate) */
  outputAmount?: number
  /** Token pricing: the cheaper rate per 1M for input the provider had cached, when it has one */
  cachedAmount?: number
  /**
   * Replicate models billed by the time they run: the provider's own rate per second for the hardware the model runs on. `amount` is then
   * the typical cost of one run (Replicate's own median), and a run is billed predict_time times this rate.
   */
  computeSecond?: number
  /** Overrides the base amount when every key in `when` matches the chosen parameters */
  rules?: PriceRule[]
  /** Where the number came from: provider API, curated override, or bundled estimate */
  source: "api" | "scraped" | "curated" | "estimate" | "edited"
  fetchedAt: string
}

export interface ModelRecord {
  /** Globally unique: provider/endpoint */
  id: string
  endpoint: string
  provider: string
  name: string
  family: string
  logoKey: string
  modality: RegistryModality
  inputs: Array<"text" | "image" | "video" | "audio">
  params: ParamSchema
  price: ModelPrice
  status: "active" | "deprecated" | "preview"
  description?: string
  /** Provider-highlighted models rank first in the picker */
  featured?: boolean
  /** The company that made the model (Kling, Google, Black Forest Labs). Differs from `provider` for hosted models. */
  maker?: string
  /** Parsed version from the name, used to decide which model supersedes which */
  version?: number[]
  /** ISO date the provider retires the model. Past dates are dropped automatically. */
  retiresAt?: string
  /** The provider itself calls this model previous, legacy or deprecated in its docs */
  outdated?: boolean
  /** Id of the newer model that replaces this one */
  supersededBy?: string
  /** Small facts for the picker row */
  summary?: ModelSummary
  /** Replicate: the version id a run is created from */
  providerVersion?: string
  /** The chat model takes a `tools` parameter, from the provider's own model list. Unknown when absent. */
  tools?: boolean
  /** Provider task, e.g. text-to-video. Text-first tasks are preferred as defaults. */
  task?: string
  /** ISO date of the last provider-side update, used to rank by freshness */
  updatedAt?: string
  /** ISO date this model first appeared in the app's catalog; recent ones are tagged New */
  addedAt?: string
  /** Added by the person by hand: kept across refreshes and never pruned */
  custom?: boolean
  /** The jobs the standard database says this model does, and how it ranks for each on its provider (1 = first choice) */
  jobs?: Array<{ id: string; rank: number; role?: "model" | "substitute" | "alternative" }>
  /** A tool that changes a file (upscale, background removal ...): used by the AI tools, never offered as a model to make something with */
  utility?: boolean
}

export interface ModelSummary {
  /** Highest resolution label the model supports, e.g. 1080p or 4K */
  maxResolution?: string
  maxSeconds?: number
  /** Whether the model can produce sound (video) or accepts audio */
  audio?: boolean
  maxImages?: number
  /** Chat context window, in tokens */
  contextTokens?: number
  aspects?: string[]
  /** What the model can take as references */
  refs?: RefSummary
  /** LiteLLM capability badges for model picker decision-making */
  vision?: boolean
  reasoning?: boolean
  webSearch?: boolean
  videoInput?: boolean
  audioInput?: boolean
}

export interface RegistrySnapshot {
  version: string
  builtAt: string
  models: ModelRecord[]
}

export const EMPTY_SCHEMA: ParamSchema = { type: "object", properties: {} }

export const STALE_PRICE_DAYS = 14

export function isPriceStale(price: ModelPrice, now = Date.now()): boolean {
  const t = Date.parse(price.fetchedAt)
  if (Number.isNaN(t)) return true
  return now - t > STALE_PRICE_DAYS * 86_400_000
}

export function formatPrice(price: ModelPrice): string {
  if (price.amount === null && price.computeSecond) return `$${price.computeSecond} / compute sec`
  if (price.amount === null) return "Price n/a"
  const a = price.amount
  const n = a < 0.01 ? a.toFixed(4) : a < 1 ? a.toFixed(3) : a.toFixed(2)
  switch (price.unit) {
    case "per_image": return `$${n} / image`
    case "per_second": return `$${n} / sec`
    case "per_run": return `$${n} / run`
    case "per_megapixel": return `$${n} / MP`
    case "per_1m_tokens": return `$${n} / 1M tok`
    case "per_1k_chars": return `$${n} / 1K chars`
    case "per_minute": return `$${n} / min`
    case "per_megapixel_second": return `$${n} / MP·s`
    case "per_frame": return `$${n} / frame`
    default: return `$${n}`
  }
}

/** Compact price for list rows: "$0.07/s", "$0.04/img", "$0.10". */
export function formatPriceShort(price: ModelPrice): string {
  if (price.amount === null && price.computeSecond) return `$${price.computeSecond}/cs`
  if (price.amount === null) return "—"
  const a = price.amount
  const n = a === 0 ? "free" : a < 0.01 ? `$${a.toFixed(4)}` : a < 1 ? `$${a.toFixed(2)}` : `$${a.toFixed(1)}`
  if (a === 0) return n
  switch (price.unit) {
    case "per_image": return `${n}/img`
    case "per_second": return `${n}/s`
    case "per_megapixel": return `${n}/MP`
    case "per_1m_tokens": return `${n}/1M`
    case "per_1k_chars": return `${n}/1K`
    case "per_minute": return `${n}/min`
    case "per_megapixel_second": return `${n}/MP·s`
    case "per_frame": return `${n}/frame`
    default: return n
  }
}

export const UNIT_TEXT: Record<PriceUnit, string> = {
  per_image: "per image",
  per_second: "per second",
  per_run: "per run",
  per_1m_tokens: "per 1M tokens",
  per_megapixel: "per megapixel",
  per_1k_chars: "per 1K characters",
  per_minute: "per minute",
  per_megapixel_second: "per megapixel-second",
  per_frame: "per frame",
  unknown: "",
}

/** "$0.07 per second" in the chosen currency; token prices show input and output. */
export function describePrice(price: ModelPrice, format: (usd: number) => string, modality?: RegistryModality): string {
  if (price.amount === null && price.computeSecond) return `${format(price.computeSecond)} per second of machine time`
  if (price.amount === null) return "Price not published"
  if (price.unit === "per_1m_tokens" && modality === "image") return `${format(price.amount)} per 1M image tokens (cost depends on size and quality)`
  const base = `${format(price.amount)} ${UNIT_TEXT[price.unit]}`.trim()
  return price.outputAmount !== undefined ? `${format(price.amount)} in / ${format(price.outputAmount)} out ${UNIT_TEXT[price.unit]}` : base
}
