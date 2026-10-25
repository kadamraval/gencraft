import { cameraCommands, lintCamera, withCameraCommands } from "../recipes/camera"
import { evenShots, klingShots, lintShots, totalOf, wanStoryboard } from "../recipes/shots"
import type { Profile, Rule, Selection, Source } from "../types"

/**
 * Google Veo 3.1, Kling 3.0 Omni, Alibaba Wan 3.0 and MiniMax Hailuo, written from each maker's own pages (read
 * 2026-10-13 in the built-in browser). Seedance is in its own file. Every rule below is a statement on the maker's page;
 * nothing here is inferred from a host.
 */

const source = (url: string, note: string): Source => ({ url, read: "2026-10-13", tier: "official", note })

const text = (v: unknown) => String(v ?? "").toLowerCase()
const has = (s: Selection, key: string, value: string) => text(s.values[key]) === value

// ───────────────────────────── Google Veo 3.1 ─────────────────────────────

const veoSources = [
  source("https://ai.google.dev/gemini-api/docs/video", "length, resolution, references and extension couplings; prompt structure"),
  source("https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation", "request fields"),
]

/** Length is 4, 6 or 8 s, but 8 s is the only length with references, extension, 1080p or 4k. */
const veoRules: Rule[] = [
  { id: "hd-length", when: (s) => has(s, "resolution", "1080p") || has(s, "resolution", "4k"), only: { duration: [8] }, reason: "1080p and 4K clips run 8 seconds." },
  { id: "refs-length", when: (s) => s.inputs.images > 0 || s.feature === "reference", only: { duration: [8] }, reason: "Clips made from reference images run 8 seconds." },
  { id: "extend", when: (s) => s.feature === "extend" && s.inputs.sourceVideo, only: { duration: [8], resolution: ["720p"] }, reason: "An extension is 8 seconds at 720p." },
]

const veoLiteRules: Rule[] = [
  { id: "lite-no-refs", when: (s) => s.inputs.images > 0 || s.feature === "reference", lock: {}, warn: "This version does not take reference images.", reason: "Veo 3.1 Lite has no reference images." },
  { id: "lite-no-extend", when: (s) => s.feature === "extend", lock: {}, warn: "This version cannot extend a video.", reason: "Veo 3.1 Lite has no extension." },
]

const veoRecipe: Profile["recipe"] = {
  tips: [
    "Order it: subject, action, style, camera, then the room or light.",
    "Put spoken words in quotes. Name sound effects and the room tone on their own.",
    "One action per clip works best.",
  ],
  lint: ({ prompt }) => (/\b(\d+)\s*(times|x)\b|\bfast(er)?\b|\bslow(er)?\b/i.test(prompt) ? ["Exact counts and speed words are read loosely; describe the motion instead."] : []),
}

const veo = (id: string, names: string[], extra: Partial<Profile>): Profile => ({
  id,
  names,
  maker: "Google",
  kind: "video",
  rules: veoRules,
  recipe: veoRecipe,
  sources: veoSources,
  ...extra,
})

// ───────────────────────────── Kling 3.0 Omni ─────────────────────────────

const klingSources = [source("https://kling.ai/document-api/api/video/3-0-omni/text-to-video", "multi-shot syntax and limits, audio, resolution, billing")]

/** Shots are written in the prompt as "shot 1, 5, words;". Their seconds add up to the length of the clip. */
const klingRules: Rule[] = [
  {
    id: "shots-sum",
    when: (s) => (s.shots?.length ?? 0) > 0,
    lock: (s) => ({ duration: (s.shots ?? []).reduce((n, x) => n + x, 0) }),
    reason: "The length is the shots added up.",
  },
]

const KLING_SHOT_LIMITS = { min: 1, maxShots: 6, maxChars: 512 }

// ───────────────────────────── Alibaba Wan 3.0 ─────────────────────────────

const wanSources = [
  source("https://www.alibabacloud.com/help/en/model-studio/wan3-video-generation-guide", "storyboard syntax, media limits"),
  source("https://www.alibabacloud.com/help/en/model-studio/wan3-video-generation-api-reference", "request fields, length 2 to 30 or -1"),
]

const wanRules: Rule[] = [
  {
    id: "shots-sum",
    when: (s) => (s.shots?.length ?? 0) > 0,
    lock: (s) => ({ duration: (s.shots ?? []).reduce((n, x) => n + x, 0) }),
    reason: "The length is the shots added up.",
  },
  {
    id: "frames-or-refs",
    when: (s) => (s.inputs.start || s.inputs.end) && (s.inputs.images > 0 || s.inputs.videos > 0 || s.inputs.audios > 0),
    lock: {},
    warn: "A start or end image cannot be mixed with reference files in one clip. Pick one way to give files.",
    reason: "The maker does not allow frames and references together.",
  },
]

// ───────────────────────────── MiniMax Hailuo ─────────────────────────────

const hailuoSources = [source("https://platform.minimax.io/docs/api-reference/video-generation-t2v", "camera commands, length and resolution couplings")]

/** 10 s is only at 768P and 1080P is only 6 s. */
const hailuoRules: Rule[] = [
  { id: "1080-length", when: (s) => has(s, "resolution", "1080p"), only: { duration: [6] }, reason: "1080P clips run 6 seconds." },
  { id: "10s-resolution", when: (s) => Number(s.values.duration) === 10, only: { resolution: ["768p"] }, reason: "10 second clips are made at 768P." },
]

export const VIDEO_PROFILES: Profile[] = [
  veo("veo-3.1", ["Veo 3.1"], { notWords: ["fast", "lite"] }),
  veo("veo-3.1-fast", ["Veo 3.1 Fast"], { variant: "Fast", variantWords: ["fast"] }),
  veo("veo-3.1-lite", ["Veo 3.1 Lite"], { variant: "Lite", variantWords: ["lite"], rules: [...veoRules, ...veoLiteRules] }),
  {
    id: "kling-3.0-omni",
    names: ["Kling 3.0 Omni", "Kling O3"],
    maker: "KlingAI",
    kind: "video",
    shotsInPrompt: true,
    rules: klingRules,
    recipe: {
      shape: ({ prompt, shots, totalSeconds }) => {
        if (!shots?.length) return prompt
        const rows = shots.some((s) => s.seconds > 0) ? shots : evenShots(shots.map((s) => s.text), totalSeconds ?? shots.length * 3)
        return klingShots(rows)
      },
      tips: ["Name the people and objects in the first shot; later shots can say \"the same man\".", "Each shot is its own sentence of what the camera sees."],
      lint: ({ shots, totalSeconds }) => {
        const out = shots?.length ? lintShots(shots, KLING_SHOT_LIMITS) : []
        if (shots?.length && totalSeconds && totalOf(shots) !== totalSeconds) out.push("The shot lengths should add up to the clip length.")
        return out
      },
    },
    sources: klingSources,
  },
  {
    id: "wan-3.0",
    names: ["Wan 3.0", "Wan 3"],
    maker: "Alibaba",
    kind: "video",
    shotsInPrompt: true,
    imageTag: (n) => `Image ${n}`,
    inputs: { images: { max: 10 }, videos: { max: 5, maxSeconds: 15, note: "1 to 15 s each, 15 s together" }, audios: { max: 5 } },
    rules: wanRules,
    recipe: {
      shape: ({ prompt, shots, totalSeconds }) => {
        if (!shots?.length) return prompt
        const rows = shots.some((s) => s.seconds > 0) ? shots : evenShots(shots.map((s) => s.text), totalSeconds ?? shots.length * 5)
        return prompt.trim() ? `${prompt.trim()}\n${wanStoryboard(rows)}` : wanStoryboard(rows)
      },
      tips: ["Give each shot 4 to 6 seconds.", "Say Image 1, Video 1 or Audio 1 for each file you attach."],
      lint: ({ shots }) => (shots?.length ? lintShots(shots, { min: 4, max: 6 }) : []),
    },
    sources: wanSources,
  },
  {
    id: "hailuo-2.3",
    names: ["Hailuo 2.3", "MiniMax Hailuo 2.3"],
    maker: "MiniMax",
    kind: "video",
    notWords: ["fast"],
    rules: hailuoRules,
    recipe: {
      // The maker's own page says its commands are more accurate than the same words in a sentence.
      shape: ({ prompt }) => withCameraCommands(prompt, cameraCommands(prompt)),
      defaults: { prompt_optimizer: true },
      tips: ["Camera moves go in square brackets, such as [Push in]; up to 3 in one bracket happen together."],
      lint: ({ prompt }) => lintCamera(prompt),
    },
    sources: hailuoSources,
  },
  {
    id: "hailuo-02",
    names: ["Hailuo 02", "MiniMax Hailuo 02"],
    maker: "MiniMax",
    kind: "video",
    rules: hailuoRules,
    recipe: {
      shape: ({ prompt }) => withCameraCommands(prompt, cameraCommands(prompt)),
      defaults: { prompt_optimizer: true },
      tips: ["Camera moves go in square brackets, such as [Push in]; up to 3 in one bracket happen together."],
      lint: ({ prompt }) => lintCamera(prompt),
    },
    sources: hailuoSources,
  },
]

// ───────────────────────────── Black Forest Labs FLUX 3 (video) ─────────────────────────────

const fluxSources = [
  source("https://docs.bfl.ml/api-reference/utility/generate-a-video-with-flux-3.md", "modes, keyframes, length limits per mode"),
  source("https://docs.bfl.ml/guides/prompting_video_overview.md", "prompt structure, camera and motion words"),
]

const fluxRules: Rule[] = [
  {
    id: "continue-cap",
    when: (s) => s.inputs.sourceVideo && Number(s.values.duration) > 15,
    lock: {},
    warn: "Continuing a video runs at most 15 seconds.",
    reason: "A continuation is 5 to 15 seconds.",
  },
  {
    id: "keyframes-length",
    when: (s) => (s.inputs.start ? 1 : 0) + (s.inputs.end ? 1 : 0) + s.inputs.images >= 3 && Number(s.values.duration) === 0,
    lock: {},
    warn: "Three or more keyframes need a set length, not Auto.",
    reason: "More than two keyframes need a set length.",
  },
]

VIDEO_PROFILES.push({
  id: "flux-3-video",
  names: ["FLUX 3"],
  maker: "Black Forest Labs",
  kind: "video",
  rules: fluxRules,
  recipe: {
    tips: [
      "Say what the camera does: static shot, slow push-in, handheld follow, overhead drift.",
      "Describe the room, light and time of day, then how things move (slow, abrupt, weightless).",
      "Put the sound after the picture: speech, ambience, effects, music.",
      "When you continue a video, say how the shot keeps going without a cut and what must stay the same.",
    ],
  },
  sources: fluxSources,
})

// ───────────────────────────── xAI Grok Imagine (video) ─────────────────────────────

VIDEO_PROFILES.push({
  id: "grok-imagine-video",
  names: ["Grok Imagine Video 1.5", "Grok Imagine Video", "Grok Imagine"],
  maker: "xAI",
  kind: "video",
  // Version 1.5: up to 14 reference images and 3 voice references, first, last and mid-video frames can be pinned
  inputs: { images: { max: 14 }, audios: { max: 3, note: "voice references" } },
  rules: [],
  recipe: {},
  sources: [source("https://docs.x.ai/docs/guides/video-generations", "image-to-video, references, editing, extension, up to 15 seconds")],
})
