import { tokensOf } from "./shortlist"
import type { ModelRecord } from "./types"

/**
 * What a model can do for a creator, in the words a creator uses.
 *
 * People do not choose "parameters". They choose to start from an image, end on another, copy the motion of a clip,
 * extend a clip, or write several shots. Some of these are settings of the model, some are files, and some are a
 * separate endpoint the provider runs (Kling's motion control, Veo's extend). A feature hides that difference: the
 * model has it or not, and choosing it sets up whatever it takes.
 *
 * This file is the feature endpoints. The others (start and end image, references, multi-shot) come from the model's
 * own files and settings (see slots.ts and official-specs.ts).
 */

export type EndpointFeature = "motion-transfer" | "extend" | "edit" | "lip-sync" | "transition" | "effects"

export interface FeatureDef {
  id: EndpointFeature
  label: string
  /** The word under a tile */
  short: string
  /** One line a person can read: what choosing it does */
  hint: string
  /** Words in a provider's endpoint that mark it as this feature, tested on the lower-case endpoint */
  match: RegExp
}

export const FEATURES: FeatureDef[] = [
  { id: "motion-transfer", label: "Motion transfer", short: "Motion", hint: "Give a clip and a picture: the picture moves the way the clip does.", match: /(^|[/-])(motion-control|motion-transfer|pose-transfer)($|[/-])/ },
  { id: "extend", label: "Extend", short: "Extend", hint: "Continue a clip you already have.", match: /(^|[/-])(extend|extend-video|extension)($|[/-])/ },
  { id: "edit", label: "Edit video", short: "Edit", hint: "Change a clip you already have with words.", match: /(^|[/-])(edit-video|video-?edit|modify-video|replace)($|[/-])/ },
  { id: "lip-sync", label: "Lip-sync", short: "Lip-sync", hint: "Make a face speak to a voice.", match: /(^|[/-])(lip-?sync|avatar)($|[/-])/ },
  { id: "transition", label: "Transition", short: "Blend", hint: "Blend from one picture to another.", match: /(^|[/-])(transition)($|[/-])/ },
  { id: "effects", label: "Effects", short: "Effects", hint: "Apply a look or effect.", match: /(^|[/-])(effects?|styles)($|[/-])/ },
]

/** The feature an endpoint is, or undefined when it is an ordinary version of the model. */
export function featureOfEndpoint(endpoint: string): FeatureDef | undefined {
  const e = endpoint.toLowerCase()
  return FEATURES.find((f) => f.match.test(e))
}

/** Words that name a feature or a task, not the model */
const FEATURE_WORDS = new Set(["motion", "control", "transfer", "pose", "extend", "extension", "edit", "videoedit", "modify", "replace", "lipsync", "lip", "sync", "avatar", "transition", "effect", "effects", "styles", "t2v", "i2v", "r2v", "v2v", "reference"])

/** The model with both its task and its feature taken out of the name: the key that ties a feature to the model it belongs to. */
export function baseKey(record: Pick<ModelRecord, "endpoint" | "provider" | "modality">): string {
  const words = tokensOf(record.endpoint.replace(/[/_]/g, " ")).filter((t) => !FEATURE_WORDS.has(t))
  return `${record.provider}|${record.modality}|${[...new Set(words)].sort().join(" ")}`
}

export interface FeatureOffer {
  def: FeatureDef
  record: ModelRecord
}

/**
 * The features the model has at its provider: the endpoints that belong to the same model and do something extra. When a
 * provider has several (a standard and a pro motion control) the one that matches the model's own tier is offered.
 */
export function featuresOf(record: ModelRecord, pool: ModelRecord[]): FeatureOffer[] {
  // A feature endpoint is offered from the model it belongs to, and from its siblings, but not from another feature
  const own = featureOfEndpoint(record.endpoint)
  const key = baseKey(record)
  const offers = new Map<EndpointFeature, FeatureOffer>()
  for (const r of pool) {
    if (r.id === record.id || r.provider !== record.provider || r.modality !== record.modality || r.status === "deprecated") continue
    const def = featureOfEndpoint(r.endpoint)
    if (!def || def.id === own?.id || baseKey(r) !== key) continue
    const held = offers.get(def.id)
    if (!held || r.endpoint.length < held.record.endpoint.length) offers.set(def.id, { def, record: r })
  }
  return FEATURES.map((f) => offers.get(f.id)).filter((o): o is FeatureOffer => Boolean(o))
}
