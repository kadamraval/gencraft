import { computeDefaultEnabled, shortlistedFor } from "../src/lib/registry/enabled"
import { entryFor, matchScore, parseLeaderboard } from "../src/lib/registry/shortlist"
import type { ShortlistEntry } from "../src/lib/registry/shortlist"
import type { ModelRecord } from "../src/lib/registry/types"

let fails = 0
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`)
  if (!ok) fails++
}

// A board row as the page renders it
const row = (name: string, creator: string, elo: number, link = "") =>
  `<tr class="x"><td>1</td><td><img alt="${creator} logo"/><span class="font-medium min-w-0 truncate group-hover:underline" data-state="closed">${name}</span>${link}</td><td><span class="w-10 text-right">${elo}</span></td></tr>`
const page = `<table>${[
  row("GPT Image 2.5 Sunburst (max)", "OpenAI", 1198),
  row("Qwen-Image-2.1", "Alibaba", 1036, '<a href="https://huggingface.co/Qwen/Qwen-Image-2.1">weights</a>'),
  row("Ideogram 4.0", "Ideogram", 1011, '<a href="https://huggingface.co/collections/ideogram-ai">collection</a>'),
  row("Qwen Image Max 2512", "Alibaba", 1161, '<a href="https://huggingface.co/spaces/Qwen/demo">demo</a>'),
  row("AT&amp;T Voice", "AT&amp;T", 900),
].join("")}</table><tr><td>no model here</td></tr>`
const rows = parseLeaderboard(page)
check("every model row is read", rows.length === 5, String(rows.length))
check("name, maker and Elo are read", rows[0]?.name === "GPT Image 2.5 Sunburst (max)" && rows[0]?.creator === "OpenAI" && rows[0]?.elo === 1198)
check("a Hugging Face model link means public weights", rows[1]?.weights === "Qwen/Qwen-Image-2.1")
check("a collection or a demo space is not a model", rows[2]?.weights === undefined && rows[3]?.weights === undefined)
check("an ampersand is read as one", rows[4]?.name === "AT&T Voice")
check("a row without an Elo is skipped", parseLeaderboard('<tr><td><span class="font-medium min-w-0 truncate">x</span></td></tr>').length === 0)

const rec = (endpoint: string, name: string, modality: ModelRecord["modality"] = "image", provider = "fal", task = "text-to-image"): ModelRecord =>
  ({ id: `${provider}/${endpoint}`, endpoint, name, provider, modality, task, family: name, logoKey: "", inputs: ["text"], params: { type: "object", properties: {} }, price: { unit: "unknown", amount: null, source: "estimate", fetchedAt: "" }, status: "active" }) as ModelRecord

// Real board names against real model names
const same = (board: string, endpoint: string, name: string) => matchScore(board, rec(endpoint, name)) > 0
check("the version must be the same: 2.1 is not 2.5", same("Nano Banana 2.1", "google/nano-banana-2.1", "Nano Banana 2.1") && !same("Nano Banana 2.1", "google/nano-banana-2", "Nano Banana 2") && !same("Nano Banana 2.1", "google/nano-banana-2.5", "Nano Banana 2.5"))
check("a variant word must be there: Sunburst is not Flare", same("GPT Image 2.5 Sunburst (max)", "openai/gpt-image-2.5/sunburst", "GPT Image 2.5 Sunburst") && !same("GPT Image 2.5 Sunburst (max)", "openai/gpt-image-2.5/flare", "GPT Image 2.5 Flare"))
check("3.0, v3 and 3 are one version", same("Wan 3.0", "alibaba/wan-3", "Wan 3") && same("Kling 3.0 Omni 1080p (Pro)", "kwaivgi/kling-v3-omni-video", "Kling V3 Omni Video"))
check("Kling 3.0 is not Kling 3.0 Omni", !same("Kling 3.0 Omni 1080p (Pro)", "kwaivgi/kling-v3-video", "Kling V3 Video"))
check("a brand prefix on the board does not block a match", same("Dreamina Seedance 2.5", "bytedance/seedance-2.5", "Seedance 2.5"))
check("a name in brackets can carry the model's other name", same("Nano Banana 2 (Gemini 3.1 Flash Image)", "google/gemini-3.1-flash-image", "Gemini 3.1 Flash Image"))
check("a generic name needs its maker: TTS-1 is OpenAI's, not xAI's", matchScore("TTS-1", rec("openai/tts-1", "tts-1", "audio", "openai"), "OpenAI") > 0 && matchScore("TTS-1", rec("xai/tts/v1", "Tts", "audio"), "OpenAI") === 0)
check("a board name no model shares matches nothing", matchScore("Utopai X", rec("alibaba/wan-3", "Wan 3")) === 0)

// What the picker starts with
const e = (rank: number, name: string, maker: string, open = false): ShortlistEntry => ({ modality: "image", rank, name, maker, elo: 1000 - rank, open })
const entries = [e(1, "GPT Image 2.5 Sunburst", "OpenAI"), e(2, "Nano Banana 2.1", "Google"), e(3, "Qwen-Image-2.1", "Alibaba", true), e(4, "Z-Image Turbo", "Alibaba", true)]
const pool = [
  rec("openai/gpt-image-2.5/sunburst/edit", "GPT Image 2.5 Sunburst Edit", "image", "fal", "image-to-image"),
  rec("openai/gpt-image-2.5/sunburst/text-to-image", "GPT Image 2.5 Sunburst", "image", "fal"),
  rec("google/nano-banana-2.1", "Nano Banana 2.1", "image", "fal"),
  rec("fal-ai/z-image/turbo", "Z Image Turbo", "image", "fal"),
  rec("some/older-model", "Older Model", "image", "fal"),
]
const picked = shortlistedFor(pool, entries)
check("one record per board row, the prompt-first one", picked.filter((r) => /sunburst/.test(r.endpoint)).length === 1 && picked.find((r) => /sunburst/.test(r.endpoint))?.task === "text-to-image")
check("best first", picked[0]?.endpoint.includes("sunburst") === true && picked[1]?.endpoint === "google/nano-banana-2.1")
check("a model on no board is not shortlisted", !picked.some((r) => r.endpoint === "some/older-model"))
check("open models are kept besides the closed ones", picked.some((r) => r.endpoint === "fal-ai/z-image/turbo"))
check("a record that is on no board is not matched", entryFor(rec("some/older-model", "Older Model"), entries) === undefined)

// Providers are counted on their own
const mixed = [...pool.map((r) => ({ ...r })), rec("google/nano-banana-2.1", "Nano Banana 2.1", "image", "replicate")]
check("the default list is built for every provider", computeDefaultEnabled(mixed).filter((id) => id.startsWith("replicate/")).length >= 1)

console.log(fails ? `${fails} FAILED` : "ALL PASS")
process.exit(fails ? 1 : 0)
