import { attributeOfField } from "./attributes"
import { AUDIO_SWITCH_KEYS } from "./canonical"
import { familyOf, isEditTask } from "./families"
import { canonicalModelId } from "../litellm/engine"
import { estimateRun } from "./price"
import { matchScore } from "./shortlist"
import { taskOf } from "./tasks"
import type { Task } from "./tasks"
import type { ModelRecord, ParamProperty } from "./types"

/**
 * One model, several hosts. The maker's own settings reach every host that runs the model, but each host lists a
 * different part of them in its schema. When another host lists a setting for the same model that this host's list
 * lacks, the setting is added here as untested: it is shown, sent only once a person changes it, and settled by real
 * runs (see param-checks.ts). Nothing is typed by hand.
 *
 * Only hosts that publish their own schema are filled (fal and Replicate). A direct connector to OpenAI or Gemini
 * lists nothing for a model, so it takes nothing from here.
 */

const HOSTS_WITH_SCHEMA = new Set(["fal", "replicate"])

/** Tasks that are one kind of work for this purpose: text, image and reference to video share their settings. */
function workKind(record: Pick<ModelRecord, "modality" | "task" | "endpoint">): string {
  const task = taskOf(record)
  return task === "text-to-video" || task === "image-to-video" || task === "reference-to-video" ? "video" : task
}

/** Needs a clear match: the same version numbers and every word of this model's name present in the other's. */
const MIN_SCORE = 0.5

/**
 * How a host counts runs or names files differs, so those settings do not travel: the number of results per run,
 * the sound switch (each host has its own field for it), and the host's own low-level tuning.
 */
function travels(key: string, p: ParamProperty, own: Record<string, ParamProperty>): boolean {
  if (p.format || p.rejected || p.untested || p.tier === "technical") return false
  if (attributeOfField(key) === "count") return false
  if ((AUDIO_SWITCH_KEYS as readonly string[]).includes(key)) return false
  // The host already has a field for the same standard setting under its own name
  const attr = attributeOfField(key)
  if (attr && Object.keys(own).some((k) => attributeOfField(k) === attr)) return false
  // ... or for the same thing under another name: "enable_web_search" is the host's "google_search"
  const words = distinctive(key)
  if (words.length > 0 && Object.keys(own).some((k) => distinctive(k).some((w) => words.includes(w)))) return false
  return true
}

/** The words of a field name that say what it is, without the verbs and fillers every name has */
const NAME_FILLER = new Set(["enable", "use", "with", "is", "auto", "the", "mode", "type", "id", "prompt", "switch", "level", "input", "output"])
const distinctive = (key: string): string[] => key.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !NAME_FILLER.has(w))

/** The same model as this one on the other hosts: best match per host, same kind of work. */
export function sameModelElsewhere(record: ModelRecord, pool: ModelRecord[]): ModelRecord[] {
  const kind = workKind(record)
  const canonical = canonicalModelId(record.endpoint, record.provider)
  const best = new Map<string, { r: ModelRecord; score: number }>()
  for (const other of pool) {
    if (other.provider === record.provider || other.modality !== record.modality || workKind(other) !== kind) continue
    let score = matchScore(record.name, other, record.maker ?? "")
    if (canonical.length >= 4 && canonical === canonicalModelId(other.endpoint, other.provider)) {
      score = Math.max(score, 0.95)
    }
    if (score < MIN_SCORE) continue
    const held = best.get(other.provider)
    if (!held || score > held.score) best.set(other.provider, { r: other, score })
  }
  return [...best.values()].map((x) => x.r)
}

/**
 * LiteLLM `cost-based-routing`: given a model and a pool of available models across connected providers,
 * picks the host that runs the same model at the lowest estimated USD cost for the given parameters.
 */
export function pickCheapestHostForModel(
  record: ModelRecord,
  pool: ModelRecord[],
  params: Record<string, unknown> = {},
  connectedProviders?: ReadonlySet<string>
): ModelRecord {
  const equivalents = [record, ...sameModelElsewhere(record, pool)].filter(
    (candidate) => !connectedProviders || connectedProviders.has(candidate.provider)
  )
  if (equivalents.length <= 1) return equivalents[0] ?? record

  let cheapest = equivalents[0]!
  let bestUsd = estimateRun(cheapest, params).usd ?? Number.POSITIVE_INFINITY

  for (let i = 1; i < equivalents.length; i++) {
    const candidate = equivalents[i]!
    const usd = estimateRun(candidate, params).usd
    if (usd !== null && usd > 0 && usd < bestUsd) {
      bestUsd = usd
      cheapest = candidate
    }
  }
  return cheapest
}

/** The settings other hosts list for this model that this host's list lacks, ready to add as untested. */
export function crossHostExtras(record: ModelRecord, pool: ModelRecord[]): Record<string, ParamProperty> {
  if (!HOSTS_WITH_SCHEMA.has(record.provider) || record.modality === "text") return {}
  const own = record.params.properties
  const extras: Record<string, ParamProperty> = {}
  for (const other of sameModelElsewhere(record, pool)) {
    if (!HOSTS_WITH_SCHEMA.has(other.provider)) continue
    for (const [key, p] of Object.entries(other.params.properties)) {
      if (key in own || key in extras || !travels(key, p, { ...own, ...extras })) continue
      extras[key] = { ...p, untested: true, listedBy: other.provider }
    }
  }
  return extras
}

// Files: start frame, end frame and reference images, videos and sounds

/** The files a model can take that make a new clip or picture from them. A source to edit and saved elements stay per version. */
const FILE_ROLES = new Set(["start", "end", "reference"])
const slotId = (p: ParamProperty) => `${p.slot!.kind}:${p.slot!.role}`

/** The version of the family that takes a kind of file. A text version takes none, so it is last. */
function receiverFor(id: string, family: ModelRecord[]): ModelRecord | undefined {
  const makers = family.filter((r) => !isEditTask(r))
  const prefer: Task[] = id.endsWith(":reference") ? ["reference-to-video", "image-edit", "image-to-video", "text-to-video", "text-to-image"] : ["image-to-video", "reference-to-video", "text-to-video"]
  for (const task of prefer) {
    const found = makers.find((r) => taskOf(r) === task)
    if (found) return found
  }
  return makers[0]
}

/**
 * The files other hosts take for this model that none of this host's versions take. The maker's model takes them, so
 * the version that suits each kind of file gets the slot, marked untested: it is shown, and a run settles it.
 */
export function crossHostFiles(record: ModelRecord, pool: ModelRecord[]): Record<string, ParamProperty> {
  if (!HOSTS_WITH_SCHEMA.has(record.provider) || record.modality === "text") return {}
  const family = familyOf(record, pool)
  const has = new Set(family.flatMap((m) => Object.values(m.params.properties).filter((p) => p.slot).map(slotId)))
  const added: Record<string, ParamProperty> = {}
  for (const other of sameModelElsewhere(record, pool)) {
    if (!HOSTS_WITH_SCHEMA.has(other.provider)) continue
    for (const member of familyOf(other, pool)) {
      for (const [key, p] of Object.entries(member.params.properties)) {
        if (!p.slot || !FILE_ROLES.has(p.slot.role) || p.untested || p.rejected) continue
        const id = slotId(p)
        if (has.has(id) || key in record.params.properties || key in added) continue
        if (receiverFor(id, family)?.id !== record.id) continue
        added[key] = { ...p, untested: true, listedBy: other.provider }
        has.add(id)
      }
    }
  }
  return added
}

/** The record with those settings and files added. Returns the same record when there is nothing to add. */
export function withCrossHost(record: ModelRecord, pool: ModelRecord[]): ModelRecord {
  const extras = { ...crossHostExtras(record, pool), ...crossHostFiles(record, pool) }
  return Object.keys(extras).length === 0 ? record : { ...record, params: { ...record.params, properties: { ...record.params.properties, ...extras } } }
}
