/**
 * The model sheet: one accurate record per model, built from named sources. Nothing here is guessed. A value either comes from a
 * source that says so (and the record keeps which one), or it is unknown and the sheet says that.
 *
 * Two layers:
 *  - Model: what the maker made (type, category, latest version). The same for every host.
 *  - Listing: that model on one host (endpoint, price, status). Each host has its own.
 */

/** What comes out */
export type SheetType = "image" | "video" | "audio" | "text"

/** input to output, the standard task names */
export type Category =
  | "text-to-image"
  | "image-to-image"
  | "text-to-video"
  | "image-to-video"
  | "reference-to-video"
  | "video-to-video"
  | "text-to-speech"
  | "text-to-audio"
  | "speech-to-text"
  | "audio-to-audio"
  | "video-to-audio"
  | "audio-to-video"
  | "chat"

/** What a model is for inside its category. Only the provider's own structure decides it (see jobs.ts). */
export type Job = "generate" | "edit" | "extend" | "lip-sync" | "motion-transfer" | "upscale" | "remove-background" | "remove-object" | "fill" | "relight" | "restyle" | "reframe" | "colorize" | "restore" | "interpolate" | "isolate-voice" | "noise-reduction" | "separate-audio" | "voice-change" | "dub" | "transcribe" | "other"

/** How much a value can be trusted, best first */
export type Confidence = "run" | "provider" | "maker" | "community" | "scraped"

export type FieldName = "type" | "category" | "job" | "price" | "status" | "name" | "date"

/** A single statement from one source about one listing */
export interface Fact {
  /** Host and endpoint the fact is about, for example fal + bytedance/seedance-2.5/text-to-video */
  host: string
  endpoint: string
  field: FieldName
  value: unknown
  /** The source module that said it: litellm, fal, replicate, maker ... */
  source: string
  confidence: Confidence
  /** For a LiteLLM fact, the key it came from */
  via?: string
}

export interface PriceValue {
  /** What one unit costs */
  amount: number
  unit: "per_image" | "per_second" | "per_video" | "per_megapixel" | "per_run" | "per_million_tokens" | "per_thousand_characters" | "other"
  currency: "USD"
  /** Extra detail the source gave, for example a resolution tier */
  note?: string
}

/** A value with its source. `value` is undefined when no source had it. */
export interface Sourced<T> {
  value?: T
  source?: string
  confidence?: Confidence
  /** Other sources that said something different */
  conflicts?: Array<{ source: string; value: T }>
}

export interface Listing {
  host: string
  endpoint: string
  name?: string
  /** Sources that know this endpoint at all. Empty means no source found it. */
  seenBy: string[]
  category: Sourced<Category>
  job: Sourced<Job>
  price: Sourced<PriceValue>
  status: Sourced<"active" | "deprecated">
}

export interface SheetModel {
  /** Stable id of the maker's model, from the maker list */
  id: string
  maker: string
  name: string
  type: SheetType
  category: Category
  job: Job
  listings: Listing[]
}

/**
 * The maker list: who, which latest models, and exactly where each lives on each source. Nothing is matched by name. The category and
 * the job are declared here by a person; the sources only confirm or contradict them.
 */
export interface MakerModel {
  id: string
  name: string
  type: SheetType
  category: Category
  job: Job
  /** Keys of the LiteLLM file for this model */
  litellm: string[]
  /** Exact endpoint ids on each host */
  hosts: Record<string, string[]>
}

export interface Maker {
  id: string
  name: string
  models: MakerModel[]
}

export interface MakerList {
  version: number
  makers: Maker[]
}

/** A source module: reads one outside source and returns facts. Swapping a source means writing another one of these. */
export interface CatalogSource {
  id: string
  fetch(): Promise<Fact[]>
}

/** Which source wins for each field, best first. Written in config, never in code. */
export type Precedence = Record<FieldName, string[]>
