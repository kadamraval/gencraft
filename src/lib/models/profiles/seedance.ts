import { evenShots, lintShots, numberedShots, seedanceStoryboard, totalOf } from "../recipes/shots"
import type { InputMode, ModelTask, Profile, PromptRecipe, Rule, Source } from "../types"

/**
 * ByteDance Seedance 2.5 and 2.0. Source: BytePlus ModelArk, "Dreamina Seedance 2.5 prompt guide" and the create-task
 * API reference, read 2026-10-13; the guide is kept in docs/sources/byteplus-seedance-2-5-prompt-guide.txt.
 */

const sources: Source[] = [
  { url: "https://docs.byteplus.com/en/docs/modelark/seedance-2-5-prompt-guide", read: "2026-10-13", tier: "official", note: "prompt guide, task locks, timestamps vs Shot N" },
]

/** First frame, first and last frame, and references cannot be mixed in one request. */
const modes: InputMode[] = [
  { id: "first", label: "Start image", needs: ["start"], excludes: ["first-last", "references"] },
  { id: "first-last", label: "Start and end image", needs: ["start", "end"], excludes: ["first", "references"] },
  { id: "references", label: "References", needs: ["images"], excludes: ["first", "first-last"] },
]

const editing = (s: { feature?: string; inputs: { sourceVideo: boolean } }) => s.feature === "edit" && s.inputs.sourceVideo
const extending = (s: { feature?: string; inputs: { sourceVideo: boolean } }) => s.feature === "extend" && s.inputs.sourceVideo

const rules: Rule[] = [
  {
    id: "shots-sum",
    when: (s) => (s.shots?.length ?? 0) > 0,
    lock: (s) => ({ duration: (s.shots ?? []).reduce((n, x) => n + x, 0) }),
    reason: "The length is the shots added up.",
  },
  {
    id: "edit-locks",
    when: editing,
    lock: { aspect_ratio: "adaptive", duration: 0 },
    reason: "Editing keeps the shape and length of the video you are editing.",
  },
  {
    id: "extend-ratio",
    when: extending,
    lock: { aspect_ratio: "adaptive" },
    reason: "Extending keeps the shape of the video you are extending.",
  },
  {
    id: "frames-ratio",
    when: (s) => (s.inputs.start || s.inputs.end) && !editing(s) && !extending(s),
    lock: { aspect_ratio: "adaptive" },
    reason: "The shape follows your start image.",
  },
  {
    id: "frames-same-shape",
    when: (s) => s.inputs.start && s.inputs.end,
    lock: {},
    warn: "Use a start and an end image of the same shape; a different one is stretched.",
    reason: "The end image is stretched to the start image's shape.",
  },
  {
    id: "frames-or-references",
    when: (s) => (s.inputs.start || s.inputs.end) && s.inputs.images > 0,
    lock: {},
    warn: "Start and end images cannot be mixed with reference images in one clip. Pick one way to give images.",
    reason: "The maker does not allow frames and references together.",
  },
  {
    id: "real-faces",
    when: (s) => s.inputs.images > 0 || s.inputs.start,
    lock: {},
    warn: "Photos of real people's faces are rejected unless they come from the maker's approved library.",
    reason: "Real human faces are not accepted as input.",
  },
]

/** The words the maker says a prompt must carry for the model to treat it as an edit or an extension */
const EDIT_WORDS = /\b(edit video|add|insert|remove|delete|modify|replace|change)\b/i
const EXTEND_WORDS = /\b(extend|continue|continues)\b/i

const TASKS: ModelTask[] = [
  { id: "edit", label: "Edit video", short: "Edit", hint: "Give a video and say what to add, remove or replace. Its shape and length stay." },
  { id: "extend", label: "Extend video", short: "Extend", hint: "Give a video and say how the story goes on, forward or backward." },
]

/** How the person's prompt is written for the maker: shots with timestamps (2.5) or "Shot N" (2.0), clean negatives. */
const recipe = (timestamps: boolean): PromptRecipe => ({
  shape: ({ prompt, shots, totalSeconds }) => {
    if (!shots?.length) return prompt
    const rows = shots.some((s) => s.seconds > 0) ? shots : evenShots(shots.map((s) => s.text), totalSeconds ?? shots.length * 3)
    const body = timestamps ? seedanceStoryboard(rows) : numberedShots(rows)
    return prompt.trim() ? `${prompt.trim()}\n${body}` : body
  },
  defaults: { duration: 5 },
  tips: [
    "Say what each file is: \"the knight in Image 1\", \"the voice from Audio 1\".",
    "Write what must stay unchanged when editing.",
    "Say \"no subtitles\" if you do not want any; avoid other negatives.",
    "One camera move per shot reads best.",
  ],
  lint: ({ prompt, shots, selection }) => {
    const out: string[] = []
    if (selection.feature === "edit" && !EDIT_WORDS.test(prompt)) out.push("Say what to do to the video: add, remove, replace or change something. Without a word like that it may be read as a new clip.")
    if (selection.feature === "extend" && !EXTEND_WORDS.test(prompt)) out.push("Say how to continue: extend forward, extend backward or continue from the video.")
    if (shots?.length) out.push(...lintShots(shots, { min: 1 }))
    if (timestamps && shots?.length && totalOf(shots) === 0) out.push("Give each shot a length in whole seconds.")
    if (/\b(\d+)\s*times? (per|a|every) second/i.test(prompt)) out.push("Fast repeated actions are not controlled well by time; describe the feel instead.")
    return out
  },
})

const common = {
  maker: "ByteDance Seed",
  kind: "video" as const,
  shotsInPrompt: true,
  // Numbered in the order the files are uploaded: "Image 1", "Video 1", "Audio 1"
  imageTag: (n: number) => `Image ${n}`,
  modes,
  rules,
  sources,
}

export const SEEDANCE_PROFILES: Profile[] = [
  {
    ...common,
    id: "seedance-2.5",
    tasks: TASKS,
    names: ["Seedance 2.5", "Dreamina Seedance 2.5"],
    notWords: ["fast", "mini", "lite"],
    inputs: { images: { max: 30 }, videos: { max: 10, maxSeconds: 30, note: "30 seconds together" }, audios: { max: 10, maxSeconds: 30, note: "30 seconds together" }, total: 50 },
    recipe: recipe(true),
  },
  {
    ...common,
    id: "seedance-2.0",
    names: ["Seedance 2.0", "Dreamina Seedance 2.0"],
    // Seedance 2.0 and its Fast and Mini versions do not understand timestamps, only shot numbers
    recipe: recipe(false),
    rules: rules.filter((r) => r.id !== "edit-locks" && r.id !== "extend-ratio"),
  },
]
