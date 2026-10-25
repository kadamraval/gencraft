import { refSummary } from "./slots"
import type { ModelRecord, RefSlot } from "./types"

/**
 * Reference-image limits that a provider's catalog does not carry but the maker's official documentation states.
 * Each entry names the page it was read from and the day, so a changed limit can be checked at the source.
 * fal and Replicate publish limits in each model's own schema, so they never need this table.
 */
interface OfficialLimit {
  test: (r: ModelRecord) => boolean
  images: number
  source: string
  readOn: string
}

const READ_ON = "2026-10-09"

export const OFFICIAL_REFERENCE_LIMITS: OfficialLimit[] = [
  {
    // "You can provide up to 16 images." (GPT image models, image edit)
    test: (r) => r.provider === "openai" && r.modality === "image" && /gpt-image/i.test(r.endpoint),
    images: 16,
    source: "https://developers.openai.com/api/reference/python/resources/images/methods/edit",
    readOn: READ_ON,
  },
  {
    // "Mix up to 14 reference images to produce the final image." (Gemini image models)
    test: (r) => r.modality === "image" && /gemini.*image|nano-banana/i.test(`${r.endpoint} ${r.name}`) && ["gemini", "openrouter"].includes(r.provider),
    images: 14,
    source: "https://ai.google.dev/gemini-api/docs/image-generation",
    readOn: READ_ON,
  },
]

export function officialReferenceLimit(r: ModelRecord): OfficialLimit | undefined {
  return OFFICIAL_REFERENCE_LIMITS.find((l) => l.test(r))
}

/**
 * For providers that publish no input schema: gives an image model that accepts images a reference slot.
 * The limit is the official one when the maker states it, otherwise it stays unstated (one image is used).
 */
export function withReferenceSlot(rec: ModelRecord): ModelRecord {
  if (rec.modality !== "image" || !rec.inputs.includes("image")) return rec
  if (Object.values(rec.params.properties).some((p) => p.slot)) return rec
  const official = officialReferenceLimit(rec)
  const slot: RefSlot = { kind: "image", role: "reference", list: true, max: official?.images ?? null }
  const params = { ...rec.params, properties: { ...rec.params.properties, reference_images: { type: "string" as const, title: "Reference images", format: "image" as const, slot } } }
  const refs = refSummary({ params })
  return { ...rec, params, summary: { ...rec.summary, ...(refs ? { refs } : {}) } }
}
