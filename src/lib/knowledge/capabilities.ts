import type { ParamSchema, RefSlot } from "../registry/types"
import type { CapabilityId, PackCapability } from "./schema"

/**
 * Capabilities: what a model can take in (start image, reference videos ...), read from the file fields each provider publishes. Settings
 * are parameters and stay on the line. A model's capabilities are the union of all its lines, so they are the same whichever provider runs it;
 * each line keeps only its own field name for each (`fields`).
 */

const ORDER: CapabilityId[] = ["start-image", "end-image", "reference-images", "reference-videos", "reference-audio", "elements", "source-video", "source-audio"]

/** The capability a provider's file field stands for */
export function capabilityOfSlot(slot: RefSlot): CapabilityId | undefined {
  if (slot.role === "start") return "start-image"
  if (slot.role === "end") return "end-image"
  if (slot.role === "element") return "elements"
  if (slot.role === "reference") return slot.kind === "image" ? "reference-images" : slot.kind === "video" ? "reference-videos" : "reference-audio"
  if (slot.role === "source") return slot.kind === "video" ? "source-video" : slot.kind === "audio" ? "source-audio" : "start-image"
  return undefined
}

/** The provider's own field name for each capability one line takes */
export function fieldsOf(params: ParamSchema): Partial<Record<CapabilityId, string>> | undefined {
  const out: Partial<Record<CapabilityId, string>> = {}
  for (const [key, p] of Object.entries(params.properties)) {
    const id = p.slot ? capabilityOfSlot(p.slot) : undefined
    // A list wins over a single field for the same capability
    if (id && (!out[id] || p.slot!.list)) out[id] = key
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** What a model takes in, from all its lines together. `max` is the highest number any provider states. */
export function capabilitiesOf(lines: ParamSchema[]): PackCapability[] {
  const max = new Map<CapabilityId, number | undefined>()
  for (const params of lines) {
    for (const p of Object.values(params.properties)) {
      const id = p.slot ? capabilityOfSlot(p.slot) : undefined
      if (!id) continue
      const stated = p.slot!.max ?? undefined
      const before = max.has(id) ? max.get(id) : undefined
      max.set(id, stated === undefined ? before : Math.max(before ?? 0, stated))
    }
  }
  return ORDER.filter((id) => max.has(id)).map((id) => (max.get(id) !== undefined ? { id, max: max.get(id) } : { id }))
}
