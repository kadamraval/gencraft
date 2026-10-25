import { tokensOf } from "./shortlist"
import { taskOf } from "./tasks"
import type { Task } from "./tasks"
import type { ModelRecord, RefSummary } from "./types"

/**
 * One model, several tasks. Providers publish the text, image and reference versions of a model as separate
 * endpoints, each with its own list of settings and files:
 *
 *   fal        alibaba/wan-3.0/text-to-video, .../image-to-video, .../reference-to-video
 *   Replicate  wan-video/wan-2.7-t2v, wan-video/wan-2.7-i2v, wan-video/wan-2.7-r2v
 *
 * They are one model: what a person can do with "Wan 2.7" is what all of them can do together (start and end frame
 * from the image version, reference images from the reference version). The family is found from the endpoint's own
 * words with the words that only name the task taken out, so every provider's naming works the same way.
 */

/** Words that name the task, not the model (the shared filler such as "text", "image", "video" and "to" goes with them) */
const TASK_WORDS = new Set(["t2v", "i2v", "r2v", "v2v", "reference", "videoedit", "img2vid", "txt2vid"])

/** The model with its task taken out of the name. The same for all of a provider's versions of one model. */
export function familyKey(record: Pick<ModelRecord, "endpoint" | "provider" | "modality">): string {
  const words = tokensOf(record.endpoint.replace(/[/_]/g, " ")).filter((t) => !TASK_WORDS.has(t))
  return `${record.provider}|${record.modality}|${[...new Set(words)].sort().join(" ")}`
}

/** Editing a file is a different job from making one, so it does not lend its settings to the model's rows. */
const EDITS = new Set<Task>(["video-edit", "audio-edit"])
/** Some providers file an editing model under a making task, so its name is read as well ("wan-2.7-videoedit") */
const EDIT_NAME = /(^|[/-])(video-?edit|edit-video|v2v)($|[/-])/i
export const isEditTask = (record: Pick<ModelRecord, "modality" | "task" | "endpoint">): boolean => EDITS.has(taskOf(record)) || (record.modality !== "image" && EDIT_NAME.test(record.endpoint))

/** The model's versions at one provider, including this one: the same model made for the other tasks. */
export function familyOf(record: ModelRecord, pool: ModelRecord[]): ModelRecord[] {
  if (isEditTask(record)) return [record]
  const key = familyKey(record)
  return pool.filter((r) => r.id === record.id || (r.provider === record.provider && familyKey(r) === key && !isEditTask(r)))
}

/**
 * The model of the same family that does a different task, for example the image-to-video version of a
 * text-to-video model. The plainest name wins when there are several.
 */
export function findSibling(record: ModelRecord, pool: ModelRecord[], want: Task): ModelRecord | undefined {
  return familyOf(record, pool)
    .filter((r) => r.id !== record.id && taskOf(r) === want)
    .sort((a, b) => a.endpoint.length - b.endpoint.length)[0]
}

/** What the whole family can take as files: the most any version takes, and every kind any version takes. */
export function mergeRefs(members: ModelRecord[]): RefSummary | undefined {
  const all = members.map((m) => m.summary?.refs).filter((r): r is RefSummary => Boolean(r))
  if (all.length === 0) return undefined
  const withImages = all.filter((r) => r.images > 0)
  return {
    images: Math.max(...all.map((r) => r.images)),
    start: all.some((r) => r.start),
    end: all.some((r) => r.end),
    videos: Math.max(...all.map((r) => r.videos)),
    audios: Math.max(...all.map((r) => r.audios)),
    elements: all.some((r) => r.elements),
    // The limit is stated only when every version that takes reference images states it
    stated: withImages.length === 0 ? all.every((r) => r.stated) : withImages.every((r) => r.stated),
  }
}

/** True when any version in the family can write more than one shot: the provider's own switch, or the storyboard control. */
export const familyHasMultiShot = (members: ModelRecord[]): boolean => members.some((m) => Object.keys(m.params.properties).some((k) => /^(multi_?shots?|shot_type|multi_prompt|generate_multi_clip_switch)$/.test(k)))

/** True when any version in the family lets the person choose a seed. */
export const familyHasSeed = (members: ModelRecord[]): boolean => members.some((m) => "seed" in m.params.properties)
