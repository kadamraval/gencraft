import { profileFor } from "../models/profile"
import "../models/profiles"
import { nativeShotsKey } from "./shots"
import type { ModelRecord, ParamProperty } from "./types"

/**
 * What the maker documents for a model, set against what a provider lists for it.
 *
 * The maker's own API is the master list. A host such as Replicate runs the same model, so a documented setting is
 * assumed to exist there. When the host's list lacks one we still show it, send it, and mark it `untested` until a
 * real run shows the host takes it. Verified by hand, one model at a time; each entry names its source.
 */
export interface OfficialSpec {
  /** Providers this entry applies to. Only providers a person has verified are listed. */
  providers: string[]
  /** Tested against the lower-case provider endpoint */
  endpoint: RegExp
  /** Models the provider's topic lists do not reach, fetched by name (owner/name) */
  fetch?: string[]
  /** Fields the provider lists that the generic policy would drop, with the label and tier they get */
  keep: Record<string, Partial<ParamProperty>>
  /** Documented by the maker, missing from the provider's list */
  add: Record<string, ParamProperty>
  source: string
}

export const OFFICIAL_SPECS: OfficialSpec[] = [
  {
    providers: ["replicate"],
    endpoint: /^google\/nano-banana-2\.1$/,
    fetch: ["google/nano-banana-2.1"],
    keep: {
      output_format: { title: "Output format", tier: "unique" },
    },
    add: {
      thinking_level: {
        type: "string",
        title: "Thinking level",
        description: "How much the model reasons before drawing. Documented by Google for Nano Banana 2.1; Replicate's list does not show it, so it is untested there.",
        enum: ["minimal", "medium", "high"],
        default: "medium",
        tier: "unique",
        untested: true,
      },
    },
    source: "ai.google.dev/gemini-api/docs/image-generation (read 2026-10-12); replicate.com/google/nano-banana-2.1/api/schema",
  },
  {
    // Alibaba Model Studio, Wan 3.0 video API reference and guide. Multi-shot is not an API field there: the guide says text-to-video
    // "supports single-shot and multi-shot storyboard format (4~6 seconds per shot, with timestamp annotations)", written in the prompt.
    providers: ["replicate", "fal"],
    endpoint: /^alibaba\/wan-3(\.0)?(-prime)?(\/|$)/,
    keep: {},
    add: {
      multi_shot: {
        type: "boolean",
        title: "Multi-shot",
        description: "Write one shot per line. Each line becomes a timestamped shot (about 4 to 6 seconds each), the storyboard format Wan 3.0 follows. Not a setting of the provider: it shapes your prompt.",
        default: false,
        tier: "unique",
        virtual: true,
      },
      watermark: {
        type: "boolean",
        title: "Watermark",
        description: "Documented by Alibaba (default off). This provider does not list it, so it is untested here.",
        default: false,
        tier: "advanced",
        untested: true,
      },
    },
    source: "alibabacloud.com/help/en/model-studio/wan3-video-generation-api-reference and wan3-video-generation-guide (read 2026-10-13)",
  },
]

export function officialSpecFor(provider: string, endpoint: string): OfficialSpec | undefined {
  const e = endpoint.toLowerCase()
  return OFFICIAL_SPECS.find((s) => s.providers.includes(provider) && s.endpoint.test(e))
}

/** Models to fetch by name for a provider, on top of what its topic lists return. */
export function officialFetchList(provider: string): string[] {
  return OFFICIAL_SPECS.filter((s) => s.providers.includes(provider)).flatMap((s) => s.fetch ?? [])
}


const SHOTS_IN_PROMPT: ParamProperty = {
  type: "boolean",
  title: "Multi-shot",
  description: "Write one shot per line. Each line becomes a timed shot, written the way this model's maker documents it. Not a setting of the provider: it shapes your prompt.",
  default: false,
  tier: "unique",
  virtual: true,
}

/** The record with the maker's settings that its provider does not list added: virtual controls as they are, the rest untested. */
export function withOfficial(record: ModelRecord): ModelRecord {
  const spec = officialSpecFor(record.provider, record.endpoint)
  const add: Record<string, ParamProperty> = { ...(spec?.add ?? {}) }
  // A maker that takes shots in the prompt gets the Multi-shot control wherever the host has no yes/no switch of its own
  // (a host that only has shot_type or multi_prompt, like Kling on fal, still gets it)
  if (record.modality === "video" && !("multi_shot" in add) && profileFor(record)?.shotsInPrompt && !nativeShotsKey(record)) add.multi_shot = SHOTS_IN_PROMPT
  if (Object.keys(add).length === 0) return record
  const missing = Object.entries(add).filter(([key]) => !(key in record.params.properties))
  if (missing.length === 0) return record
  return { ...record, params: { ...record.params, properties: { ...record.params.properties, ...Object.fromEntries(missing) } } }
}
