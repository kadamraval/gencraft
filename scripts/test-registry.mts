/**
 * Offline checks for everything that reads third-party pages. The samples are real wording copied from the
 * providers' pages. When a provider changes its page, the matching case here fails first, instead of the
 * registry quietly going stale.
 *
 *   npm run test:registry
 */
import { parseFalPrice } from "../src/lib/registry/adapters/fal-price.ts"
import { parseDeprecations as parseOpenAIDeprecations, parseModelDetail, parseModelList, parsePricingRows } from "../src/lib/registry/adapters/openai-docs.ts"
import { currentAmount, parseCards, parseDeprecations as parseGeminiDeprecations } from "../src/lib/registry/adapters/gemini-docs.ts"
import { applyLifecycle, isListed, parseName, compareVersions } from "../src/lib/registry/lifecycle.ts"
import { classifyParam } from "../src/lib/registry/param-policy.ts"
import { mapOpenRouterModel } from "../src/lib/registry/adapters/openrouter.ts"
import { estimateRun } from "../src/lib/registry/price.ts"
import { outputKind, parseReplicatePrice, recordFromReplicate, runReplicate } from "../src/lib/registry/adapters/replicate.ts"
import { resolveLogoSlug } from "../src/lib/registry/logo-rules.ts"
import { assignRefs, detectSlot, limitFromText, refCapability } from "../src/lib/registry/slots.ts"
import { getPriceState, getRecord, setPriceOverrides } from "../src/lib/registry/store.ts"
import { explainError } from "../src/lib/errors/explain.ts"
import { parseSkill, serializeSkill } from "../src/lib/skills/skill-file.ts"
import { PRESET_SKILLS } from "../src/lib/skills/presets.ts"
import { LIMITS } from "../src/lib/skills/limits.ts"
import { suggestSkill } from "../src/lib/skills/suggest.ts"
import { composePrompt } from "../src/lib/elements/compose.ts"
import type { ElementItem } from "../src/lib/elements/types.ts"
import type { ModelRecord } from "../src/lib/registry/types.ts"
import { taskOf } from "../src/lib/registry/tasks.ts"
import fs from "node:fs"
import { planHas, verifyLicense } from "../src/lib/license.ts"
import { findBookmark, parseBoards, parsePins, pinPictures } from "../src/lib/integrations/pinterest.ts"
import { lineOf, selectWatched } from "../src/lib/registry/watchlist.ts"
import { buildInput } from "../src/lib/registry/request.ts"
import { safetyInput } from "../src/lib/registry/safety.ts"
import snapshotJson from "../src/lib/registry/registry.snapshot.json" with { type: "json" }

let failed = 0
let passed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else {
    failed++
    console.log(`FAIL ${label}`, detail === undefined ? "" : JSON.stringify(detail))
  }
}

// fal prices
{
  const cases: Array<[string, string, { unit: string; amount?: number; rules?: number } | null]> = [
    ["megapixel", "Your request will cost $ 0.025 per megapixel Commercial usage", { unit: "per_megapixel", amount: 0.025 }],
    ["image", "Your request will cost $0.15 per image For $1.00, you can run this model 7 times", { unit: "per_image", amount: 0.15 }],
    ["audio on/off", "Your video will cost $0.07 per second (audio off) or $0.14 per second (audio on).", { unit: "per_second", amount: 0.07, rules: 2 }],
    ["veo", "For every second of video you generate you will be charged $0.20 without audio or $0.40 with audio", { unit: "per_second", amount: 0.2, rules: 2 }],
    ["resolution tiers", "Your request will cost $0.05 per second for 480p, $0.10 per second for 720p, $0.15 per second for 1080p", { unit: "per_second", amount: 0.05, rules: 3 }],
    ["per clip tiers", "For 5s video your request will cost $0.15 for 360p and 540p, $0.2 for 720p and 1080p", { unit: "per_second", rules: 4 }],
    ["every second", "For every second of video you generated, you will be charged $0.42 regardless of whether audio is on or off.", { unit: "per_second", amount: 0.42 }],
    ["flat rate", "billed per second of generated video at a flat rate of $0.20 per second , the same for both", { unit: "per_second", amount: 0.2 }],
    ["generated image", "Your request will cost $0.04 per generated image. Prompt expansion adds $0.02 per request", { unit: "per_image", amount: 0.04 }],
    ["tts", "Your request will cost $ 0.05 per 1000 character", { unit: "per_1k_chars", amount: 0.05 }],
    ["compute second is shown as its rate", "Your request will cost $0.003 per compute second. A typical call", { unit: "per_run", amount: null, computeSecond: 0.003 }],
    ["no price", "This model has no listed price", null],
  ]
  for (const [label, text, want] of cases) {
    const got = parseFalPrice(text)
    if (want === null) check(`fal price: ${label}`, got === null, got)
    else check(`fal price: ${label}`, got?.unit === want.unit && (want.amount === undefined || got.amount === want.amount) && (want.rules === undefined || got.rules?.length === want.rules), got)
  }
}

// version parsing and "newer replaces older"
{
  const v = (name: string) => parseName(name).version?.join(".")
  check("version: Kling v2.6", v("Kling Video v2.6 Text to Video [Pro]") === "2.6", v("Kling Video v2.6 Text to Video [Pro]"))
  check("version: Veo3.1 glued", v("Veo3.1 Lite") === "3.1", v("Veo3.1 Lite"))
  check("version: FLUX.2", v("FLUX.2 [klein] 9B") === "2", v("FLUX.2 [klein] 9B"))
  check("version: o3", v("o3-pro") === "3", v("o3-pro"))
  check("version: not 1080p", v("Something 1080p") === undefined, v("Something 1080p"))
  check("version order", compareVersions([2, 6], [3]) < 0 && compareVersions([1, 1], [1]) > 0)

  const rec = (id: string, name: string, extra: Partial<ModelRecord> = {}): ModelRecord => ({
    id: `fal/${id}`, endpoint: id, provider: "fal", route: "aggregator", name, family: id, logoKey: "fal", modality: "video",
    inputs: ["text"], params: { type: "object", properties: {} }, price: { unit: "unknown", amount: null, source: "estimate", fetchedAt: "" },
    status: "active", task: "text-to-video", ...extra,
  })
  const out = applyLifecycle([
    rec("a", "Seedance 2.0 Text to Video"),
    rec("b", "Seedance 2.5 Text to Video"),
    rec("c", "Seedance 2.0 Fast Text to Video"),
    rec("d", "Kling v2.5 Text to Video"),
    rec("e", "Kling v3 Text to Video"),
    rec("f", "Retiring Model 1", { retiresAt: "2099-01-01T00:00:00.000Z" }),
    rec("g", "Gone Model 1", { status: "deprecated" }),
    rec("h", "No Version Model"),
  ])
  const by = Object.fromEntries(out.map((r) => [r.endpoint, r]))
  check("lifecycle: 2.0 replaced by 2.5", by.a!.supersededBy === "fal/b", by.a!.supersededBy)
  check("lifecycle: Fast tier keeps its own line", !by.c!.supersededBy)
  check("lifecycle: Kling 2.5 replaced by 3", by.d!.supersededBy === "fal/e")
  check("lifecycle: retiring model not offered", !isListed(by.f!))
  check("lifecycle: deprecated model not offered", !isListed(by.g!))
  check("lifecycle: unversioned model stays", isListed(by.h!))
  check("lifecycle: newest stays", isListed(by.b!) && isListed(by.e!))
}

// OpenAI docs
{
  const list = "- [GPT-6 Astra](/api/docs/models/gpt-6-astra.md): Our most capable model.\n- [TTS-1](/api/docs/models/tts-1.md): Text-to-speech model optimized for speed\n"
  const items = parseModelList(list)
  check("openai list", items.length === 2 && items[0]!.id === "gpt-6-astra" && items[1]!.name === "TTS-1", items)

  const detail = `## Model details

- Input modalities: text, image
- Output modalities: text
- 1,050,000 context window
- 128,000 max output tokens
- Apr 30, 2026 knowledge cutoff

## Pricing

### Text tokens

| Metric | Price | Unit |
| --- | ---: | --- |
| Input | $10 | 1M tokens |
| Output | $50 | 1M tokens |

## Endpoints

| Endpoint | Route | Support |
| --- | --- | --- |
| Chat Completions | \`v1/chat/completions\` | Supported |
| Image generation | \`v1/images/generations\` | Not supported |
`
  const d = parseModelDetail(detail)
  check("openai detail: context", d.contextTokens === 1_050_000, d.contextTokens)
  check("openai detail: prices", d.prices.length === 2 && d.prices[0]!.amount === 10 && d.prices[1]!.amount === 50, d.prices)
  check("openai detail: endpoints", d.endpoints["chat completions"] === true && d.endpoints["image generation"] === false, d.endpoints)

  const deps = parseOpenAIDeprecations(
    "| Shutdown date | Model / system | Recommended replacement |\n| --- | --- | --- |\n| 2026-09-24 | `sora-2` | --- |\n| July 23, 2026 | `o3-deep-research-2025-06-26` \\| `o3-deep-research` | `gpt-5.6-sol` |\n",
  )
  check("openai deprecations: iso date", deps[0]?.ids[0] === "sora-2" && deps[0]?.shutdown.startsWith("2026-09-24"), deps)
  check("openai deprecations: escaped pipes and long date", deps[1]?.ids.length === 2 && deps[1]?.shutdown.startsWith("2026-07-23") && deps[1]?.replacement === "gpt-5.6-sol", deps)

  const rows = parsePricingRows("| gpt-image-2 | Image | $8.00 | $2.00 | $30.00 |\n| gpt-image-2 | Image | $4.00 | $1.00 | $15.00 |\n| tts-1 | Text | $15.00 / 1M characters | - | - |\n")
  check("openai pricing rows: first row is Standard", rows.get("gpt-image-2|image")?.[2] === "$30.00", rows.get("gpt-image-2|image"))
}

// Gemini docs
{
  check("gemini price: current side of a dated change", currentAmount("$0.75 through December 31, 2026. $1.50 starting January 1, 2027.", Date.UTC(2026, 9, 9)) === 0.75)
  check("gemini price: after the change", currentAmount("$0.75 through December 31, 2026. $1.50 starting January 1, 2027.", Date.UTC(2027, 1, 1)) === 1.5)
  check("gemini price: plain", currentAmount("$2.00 (text/image), equivalent to $0.0011") === 2)

  const cards = parseCards("[### Gemini 3.8 Flash\nOur most intelligent Flash model.\nNew Stable](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) [### Gemini 3.1 Pro\nAdvanced.\nPreview](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview)")
  check("gemini cards", cards.length === 2 && cards[0]!.id === "gemini-3.8-flash" && cards[1]!.tags === "Preview", cards)

  const deps = parseGeminiDeprecations("| `gemini-3.1-flash-lite` | May 7, 2026 | May 7, 2027 | `gemini-3.5-flash-lite` |\n| `gemini-3.8-flash` | September 2, 2026 | No shutdown date announced |   |\n")
  check("gemini deprecations", deps[0]?.shutdown?.startsWith("2027-05-07") === true && deps[0]?.replacement === "gemini-3.5-flash-lite" && deps[1]?.shutdown === undefined, deps)
}

// parameter policy
{
  check("policy: aspect ratio is common", classifyParam("aspect_ratio") === "common")
  check("policy: duration is common", classifyParam("duration") === "common")
  check("policy: camera is unique", classifyParam("camera_movement") === "unique")
  check("policy: seed is advanced", classifyParam("seed") === "advanced")
  check("policy: steps are technical, listed not dropped", classifyParam("num_inference_steps") === "technical")
  check("policy: unknown stays unknown", classifyParam("zebra_stripes") === "unknown")
}

// logos
{
  const slug = (name: string, endpoint = "", provider = "") => resolveLogoSlug({ name, endpoint, provider })
  check("logo: Inkling is not Kling", slug("Inkling Small", "", "openrouter") === "openrouter")
  check("logo: audio is not Udio", slug("Stable Audio 2.5", "fal-ai/stable-audio-25", "fal") === "stability")
  check("logo: Kling on fal", slug("Kling Video v2.6", "fal-ai/kling-video/v2.6/pro/text-to-video", "fal") === "kling")
  check("logo: Veo is Google", slug("Veo 3.1", "fal-ai/veo3.1", "fal") === "google")
}

// OpenRouter prices: quoted exactly as listed, never guessed
{
  const text = mapOpenRouterModel({ id: "anthropic/claude-haiku-5.5", name: "Anthropic: Claude Haiku 5.5", architecture: { input_modalities: ["text"], output_modalities: ["text"] }, pricing: { prompt: "0.0000001", completion: "0.0000005" } }, "")
  check("openrouter speech and transcription models are read as audio, with the voice list and the audio input", () => {
  const tts = mapOpenRouterModel({ id: "mistralai/voxtral-mini-tts-3-0", name: "Mistral: Voxtral TTS 3", architecture: { input_modalities: ["text"], output_modalities: ["speech"] }, pricing: { prompt: "0.000013", completion: "0" }, supported_voices: ["a", "b"] } as never, "")
  assert.equal(tts?.modality, "audio")
  assert.equal(tts?.task, "text-to-speech")
  assert.deepEqual(tts?.params.properties.voice?.enum, ["a", "b"])
  const stt = mapOpenRouterModel({ id: "mistralai/voxtral-mini-transcribe-3-0", name: "Mistral: Voxtral Mini Transcribe 3", architecture: { input_modalities: ["audio"], output_modalities: ["transcription"] }, pricing: { prompt: "0.0000666667", completion: "0" } } as never, "")
  assert.equal(stt?.modality, "audio")
  assert.equal(stt?.task, "speech-to-text")
  assert.equal(stt?.params.properties.audio?.format, "audio")
})

check("openrouter text: input and output per 1M", text?.price.unit === "per_1m_tokens" && Math.abs((text.price.amount ?? 0) - 0.1) < 1e-9 && Math.abs((text.price.outputAmount ?? 0) - 0.5) < 1e-9, text?.price)

  const both = mapOpenRouterModel({ id: "qwen/qwen-image-3", name: "Qwen: Qwen Image 3", architecture: { input_modalities: ["text"], output_modalities: ["image"] }, pricing: { image: "0.003", image_output: "0.0000071" } }, "")
  check("openrouter image: the output token rate wins over the input-image price", both?.price.unit === "per_1m_tokens" && Math.abs((both.price.amount ?? 0) - 7.1) < 1e-9, both?.price)
  const flat = mapOpenRouterModel({ id: "x/flat-image", name: "X: Flat Image", architecture: { input_modalities: ["text"], output_modalities: ["image"] }, pricing: { image: "0.04" } }, "")
  check("openrouter image: a lone flat price is per image", flat?.price.unit === "per_image" && flat.price.amount === 0.04, flat?.price)

  const tokens = mapOpenRouterModel({ id: "bytedance-seed/seedream-5.0-flash", name: "ByteDance Seed: Seedream 5.0 Flash", architecture: { input_modalities: ["text"], output_modalities: ["image"] }, pricing: { image_token: "0.0000043", image_output: "0.0000043" } }, "")
  check("openrouter image: token price is not shown as free", tokens?.price.unit === "per_1m_tokens" && Math.abs((tokens.price.amount ?? 0) - 4.3) < 1e-9, tokens?.price)
  if (tokens) check("image token cost is left open, not guessed", estimateRun(tokens, {}).usd === null)

  const mixed = mapOpenRouterModel({ id: "google/nano-banana-2.1", name: "Google: Nano Banana 2.1", architecture: { input_modalities: ["text", "image"], output_modalities: ["image", "text"] }, pricing: { prompt: "0.0000015", completion: "0.0000075", image_output: "0.00003" } }, "")
  check("openrouter: a model that outputs images is an image model", mixed?.modality === "image" && Math.abs((mixed.price.amount ?? 0) - 30) < 1e-9, mixed?.price)

  const router = mapOpenRouterModel({ id: "openrouter/auto", name: "Auto Router", architecture: { input_modalities: ["text"], output_modalities: ["text", "image"] }, pricing: { prompt: "-1", completion: "-1" } }, "")
  check("openrouter: routers have no price and are skipped", router === null)
}

// Replicate billing tiers embedded in a model page
{
  const page = `<script>{"billingConfig": {"current_description": "x", "current_tiers": [{"criteria": [{"title": "model variant", "type": "equals", "value": "standard"}], "prices": [{"metric": "video_output_duration_seconds", "price": "$0.05", "title": "per second of output video"}]}, {"criteria": [{"title": "model variant", "type": "equals", "value": "pro"}], "prices": [{"metric": "video_output_duration_seconds", "price": "$0.09", "title": "per second of output video"}]}]}, "other": 1}</script>`
  const p = parseReplicatePrice(page)
  check("replicate page: per-second tiers", p?.unit === "per_second" && p.amount === 0.05 && p.rules?.length === 2, p)
  check("replicate page: nothing to read", parseReplicatePrice("<html>no billing here</html>") === null)
}

// Reference slots: wording and field names are copied from real fal schemas
{
  const lim = (t: string) => limitFromText(t)?.max ?? null
  check("limit: seedance", lim("Reference images to guide video generation. Refer to them in the prompt as @Image1. Supported formats: JPEG, PNG, WebP. Max 30 MB per image. Up to 9 images.") === 9)
  check("limit: kling total", limitFromText("Elements to include. Maximum 7 total (elements + reference images + start image).")?.max === 7 && limitFromText("Maximum 7 total (elements + reference images + start image).")?.shared === true)
  check("limit: range in brackets", lim("Reference images for subject consistency (1-9 images). Formats: JPEG, JPG, PNG, WEBP.") === 9)
  check("limit: up to N urls", lim("Up to 10 reference image URLs.") === 10)
  check("limit: time is not a count", lim("Up to 5 reference video URLs totaling at most 15 seconds.") === 5 && lim("Clip of at most 15 seconds") === null)
  check("limit: size is not a count", lim("Max 30 MB per image") === null)
  check("limit: nothing stated", lim("List of video URLs to merge in order") === null)

  const role = (key: string, f: Parameters<typeof detectSlot>[1], m: "image" | "video" = "video") => detectSlot(key, f, m)?.role ?? null
  check("slot: image_url on video is the start frame", role("image_url", { type: "string" }) === "start")
  check("slot: image_url on image is a reference", role("image_url", { type: "string" }, "image") === "reference")
  check("slot: end frame names", role("end_image_url", { type: "string" }) === "end" && role("last_frame_url", { type: "string" }) === "end" && role("tail_image_url", { type: "string" }) === "end")
  check("slot: first frame names", role("first_frame_url", { type: "string" }) === "start" && role("start_image_url", { type: "string" }) === "start")
  check("slot: reference list", role("reference_image_urls", { type: "array", items: { type: "string" } }) === "reference")
  check("slot: elements are objects", role("elements", { type: "array", items: { isObject: true } }) === "element")
  check("slot: source video and audio", role("video_url", { type: "string" }) === "source" && role("audio_url", { type: "string" }) === "source")
  check("slot: mask is not a reference", role("mask_url", { type: "string" }) === null)
  check("slot: image list keeps stated max", detectSlot("image_urls", { type: "array", items: { type: "string" }, maxItems: 9 }, "video")?.max === 9)

  const params = {
    type: "object" as const,
    properties: {
      start_image_url: { type: "string" as const, format: "image" as const, slot: detectSlot("start_image_url", { type: "string" }, "video")! },
      image_urls: { type: "string" as const, format: "image" as const, slot: detectSlot("image_urls", { type: "array", items: { type: "string" }, maxItems: 3 }, "video")! },
    },
    required: ["start_image_url"],
  }
  const cap = refCapability({ params })
  check("capability: start, images, needs", cap.start?.key === "start_image_url" && cap.images?.max === 3 && cap.needs.includes("start"), cap)
  const a = assignRefs(cap, { start: "S", images: ["a", "b", "c", "d"] })
  check("assign: list is cut to the limit and the rest reported", JSON.stringify(a.input) === JSON.stringify({ start_image_url: "S", image_urls: ["a", "b", "c"] }) && a.leftOver.join() === "d", a)

  const kling = refCapability({ params: { type: "object", properties: { elements: { type: "string", format: "image", slot: detectSlot("elements", { type: "array", items: { isObject: true }, description: "Maximum 7 total" }, "video")! } } } })
  const k = assignRefs(kling, { images: ["f", "r1", "r2", "g"], groups: [["f", "r1", "r2"], ["g"]] })
  check("assign: kling elements keep their angles", JSON.stringify(k.input) === JSON.stringify({ elements: [{ frontal_image_url: "f", reference_image_urls: ["r1", "r2"] }, { frontal_image_url: "g" }] }), k)
  const none = assignRefs(refCapability({ params: { type: "object", properties: {} } }), { images: ["a"] })
  check("assign: model without slots takes nothing", Object.keys(none.input).length === 0 && none.leftOver.join() === "a")
}

// Replicate language models
{
  const llm = {
    owner: "meta",
    name: "meta-llama-3-70b-instruct",
    description: "A 70 billion parameter language model from Meta, fine tuned for chat completions",
    latest_version: {
      id: "v1",
      created_at: "2026-01-01T00:00:00Z",
      openapi_schema: {
        components: {
          schemas: {
            Input: { type: "object", properties: { prompt: { type: "string" }, max_tokens: { type: "integer" } } },
            Output: { type: "array", items: { type: "string" }, "x-cog-array-type": "iterator", "x-cog-array-display": "concatenate" },
          },
        },
      },
    },
  }
  const image = { ...llm, name: "some-image", latest_version: { ...llm.latest_version, openapi_schema: { components: { schemas: { Input: { type: "object", properties: {} }, Output: { type: "string", format: "uri" } } } } } }
  check("replicate output: concatenated text is a language model", outputKind(llm) === "text")
  check("replicate output: uri is a file", outputKind(image) === "file")
  const rec = recordFromReplicate(llm, { modality: "image", task: "text-to-image" }, "2026-01-01T00:00:00Z")
  check("replicate: a language model in any collection becomes a chat model", rec?.modality === "text" && rec.id === "replicate/meta/meta-llama-3-70b-instruct", rec)
  const filed = recordFromReplicate(image, { modality: "text", task: "text" }, "x")
  check("replicate: a media model in the chat collection is not a chat model, it is sorted by what it says it is", filed?.modality === "image", filed?.modality)
  check("replicate: a media model that says nothing about itself is left out", recordFromReplicate({ ...image, name: "thing", description: "A useful model" }, { modality: "text", task: "text" }, "x") === null)

  const tokens = parseReplicatePrice(
    `{"billingConfig": {"current_tiers": [{"prices": [{"metric": "input_token_count", "price": "$0.65", "title": "per million input tokens"}, {"metric": "output_token_count", "price": "$2.75", "title": "per million output tokens"}]}]}}`,
  )
  check("replicate price: input and output tokens per million", tokens?.unit === "per_1m_tokens" && tokens.amount === 0.65 && tokens.outputAmount === 2.75, tokens)
  const perToken = parseReplicatePrice(
    `{"billingConfig": {"current_tiers": [{"prices": [{"metric": "input_token_count", "price": "$0.00000065", "title": "per input token"}, {"metric": "output_token_count", "price": "$0.00000275", "title": "per output token"}]}]}}`,
  )
  check("replicate price: single-token prices scale to per million", Math.abs((perToken?.amount ?? 0) - 0.65) < 1e-9 && Math.abs((perToken?.outputAmount ?? 0) - 2.75) < 1e-9, perToken)

  const calls: string[] = []
  const out = await runReplicate({
    token: "t",
    version: "v1",
    input: { prompt: "hi" },
    call: async (path) => {
      calls.push(path)
      return new Response(JSON.stringify({ id: "p1", status: "succeeded", output: ["Hel", "lo", " there"] }), { status: 201 })
    },
  })
  check("replicate run: text pieces are joined", out.text === "Hello there" && out.urls.length === 0, out)
}

// Price corrections made by the user
{
  const id = "fal/minimax/h3-max/image-to-video"
  const before = getRecord(id)
  check("override: the record exists with the provider price", Boolean(before) && before!.price.source !== "edited", before?.price)
  setPriceOverrides({ [id]: { unit: "per_second", amount: 0.05, editedAt: "2026-10-09T00:00:00Z", providerAmount: before!.price.amount } })
  const after = getRecord(id)
  check("override: the edited price is used and tagged", after?.price.amount === 0.05 && after.price.source === "edited", after?.price)
  check("override: the provider's own price is still readable", getPriceState(id).raw?.price.amount === before!.price.amount)
  check("override: unchanged provider price is not a conflict", getPriceState(id).providerMoved === false)
  setPriceOverrides({ [id]: { unit: "per_second", amount: 0.05, editedAt: "2026-10-09T00:00:00Z", providerAmount: 0.99 } })
  check("override: a moved provider price is noticed", getPriceState(id).providerMoved === true)
  setPriceOverrides({})
  check("override: reset returns the provider price", getRecord(id)?.price.amount === before!.price.amount)
}

// Error messages: real provider wording becomes something a person can act on
{
  const kindOf = (raw: string, ctx = {}) => explainError(raw, ctx).kind
  const novita = `Live API fetch exception: Replicate run failed: Prediction failed: Async prediction failed: BadRequestError: Error code: 400 - {'error': {'message': 'text content parts must carry a string "text" (got null)', 'code': 400, 'metadata': {'provider_name': 'Novita'}}}`
  const e1 = explainError(novita, { provider: "replicate", model: "Deepseek R1" })
  check("error: replicate upstream failure is the provider's, naming who ran it", e1.kind === "provider-fault" && e1.title.includes("Novita") && e1.title.includes("Deepseek R1") && e1.retryable, e1)
  check("error: the original text is kept for the log", e1.raw === novita)
  check("error: fal rejected key", kindOf(`Fallback sequence exhausted for image. Attempted 1 models (Flux 3 Image): Live API fetch exception: fal submit failed (HTTP 401): {"detail":"Cannot access application \"fal-ai/flux-3-image\". Authentication is required to access this application."}`, { provider: "fal" }) === "auth")
  const nokey = explainError("No openai key is set, so nothing was generated. Add one in Settings, Providers.", { provider: "openai" })
  check("error: no key offers Settings", nokey.kind === "no-key" && nokey.action === "settings" && nokey.title.includes("OpenAI"), nokey)
  check("error: rate limit can be retried", explainError("OpenAI error (HTTP 429): Rate limit reached", { provider: "openai" }).retryable)
  check("error: out of credit is not read as a rate limit", kindOf("You exceeded your current quota, please check your plan and billing details") === "credit")
  check("error: safety block mentions the switch only when there is one", explainError("content_policy_violation: image flagged", { hasSafetySwitch: true }).hint?.includes("switch") === true && explainError("content_policy_violation", { hasSafetySwitch: false }).hint?.includes("no switch") === true)
  const bad = explainError(`fal submit failed (HTTP 422): {"detail":[{"loc":["body","image_size"],"msg":"value is not a valid enumeration member"}]}`, { provider: "fal" })
  check("error: a rejected setting is named", bad.kind === "bad-input" && bad.message.includes("image size"), bad)
  check("error: a model without tool calling explains the agent needs one that has it", explainError("Deepseek R1 cannot run the agent. The agent needs a chat model from OpenRouter, OpenAI or Google Gemini, because it uses tool calling.", { model: "Deepseek R1" }).title === "Deepseek R1 cannot run the agent")
  check("error: model gone", kindOf("HTTP 404: model not found", { model: "x" }) === "not-found")
  check("error: timeout and network", kindOf("Replicate run timed out") === "timeout" && kindOf("Failed to fetch") === "network")
  check("error: unknown text is shortened, never blank", explainError("").message.length > 0 && explainError("x".repeat(500)).message.length <= 200)
}

// Skills: sizes, file format, suggestions
{
  const over = PRESET_SKILLS.filter((k) => k.description.length > LIMITS.description || k.phrase.length > LIMITS.phrase || k.method.length > LIMITS.method)
  check("skills: every ready-made skill is within the size limits", over.length === 0, over.map((k) => `${k.name} ${k.description.length}/${k.phrase.length}/${k.method.length}`))
  const round = parseSkill(serializeSkill(PRESET_SKILLS[0]!))
  check("skills: a skill survives export and import", !("error" in round) && round.name === PRESET_SKILLS[0]!.name && round.phrase === PRESET_SKILLS[0]!.phrase && round.method === PRESET_SKILLS[0]!.method && round.appliesTo.join() === PRESET_SKILLS[0]!.appliesTo.join(), round)
  check("skills: a file without a header is refused with a reason", "error" in parseSkill("just text"))
  check("skills: a file with no text sections is refused", "error" in parseSkill("---\nname: x\napplies-to: image\n---\n"))
  const views = PRESET_SKILLS.map((k) => ({ ...k, on: true }))
  check("skills: a product prompt suggests the product skill", suggestSkill("a bottle of perfume on a marble table", views, [])?.id === "product")
  check("skills: whole words only, so add does not match ad", suggestSkill("please add some more clouds here", views, []) === undefined)
  check("skills: an already chosen skill is not suggested again", suggestSkill("a bottle of perfume on a marble table", views, ["product"])?.id !== "product")
}

// Elements: prompt composer
{
  const el = (id: string, category: ElementItem["category"], name: string, imageUrls: string[] = [], text = ""): ElementItem => ({ id, category, name, imageUrls, text, origin: "written", createdAt: 0 })
  const mira = el("c1", "character", "Mira", ["m1", "m2"])
  const loft = el("l1", "location", "Loft", ["l1"])
  const gold = el("s1", "light", "Golden hour", [], "warm golden hour sunlight")
  const neon = el("s2", "light", "Neon", [], "neon signs")
  const dolly = el("s3", "camera", "Dolly", [], "slow dolly-in")

  const a = composePrompt({ prompt: "@Mira walks in", elements: [mira, loft, gold, dolly], references: [], referenceLimit: 3 })
  check("compose: characters keep slots first, then round robin", a.imageUrls.join() === "m1,m2,l1", a.imageUrls)
  check("compose: @Name gets its image numbers", a.prompt.startsWith("Mira (images 1-2) walks in."), a.prompt)
  check("compose: labels name each image", a.prompt.includes("images 1-2 show Mira (character)") && a.prompt.includes("image 3 shows Loft (location)"), a.prompt)
  check("compose: style phrases follow", a.prompt.includes("light: warm golden hour sunlight") && a.prompt.includes("camera: slow dolly-in"), a.prompt)

  const b = composePrompt({ prompt: "walk", elements: [mira, loft], references: [], referenceLimit: 2 })
  check("compose: one image each before a second", b.imageUrls.join() === "m1,l1", b.imageUrls)

  const c = composePrompt({ prompt: "@Mira walks", elements: [mira, gold], references: [], referenceLimit: 0 })
  check("compose: no reference support sends no images", c.imageUrls.length === 0 && c.notes.some((n) => n.includes("Mira was left out")), c)
  check("compose: no reference support still adds style text", c.prompt === "Mira walks. light: warm golden hour sunlight.", c.prompt)

  const d = composePrompt({ prompt: "x", elements: [gold, neon], references: [], referenceLimit: 0 })
  check("compose: one style per category, last wins", d.prompt.includes("neon signs") && !d.prompt.includes("golden"), d.prompt)

  const sk = composePrompt({ prompt: "a cup", elements: [gold], references: [], referenceLimit: 0, skillPhrases: ["clean studio shot, soft shadow.", "  ", "85mm lens"] })
  check("compose: skill phrases come last and blanks are ignored", sk.prompt === "A cup. light: warm golden hour sunlight. clean studio shot, soft shadow, 85mm lens.".replace("A cup", "a cup"), sk.prompt)
  const e = composePrompt({ prompt: "hello", elements: [], references: [{ id: "u1", name: "photo", url: "p1" }], referenceLimit: 2 })
  check("compose: plain attachments pass through, no label sentence", e.imageUrls.join() === "p1" && e.prompt === "hello.", e)
}

// tasks: the three video tasks are told apart
check("tasks: image-to-video, reference-to-video and text-to-video are told apart", taskOf({ modality: "video", task: "image-to-video", endpoint: "a/b/image-to-video" }) === "image-to-video" && taskOf({ modality: "video", task: "text-to-video", endpoint: "alibaba/wan-3.0/reference-to-video" }) === "reference-to-video" && taskOf({ modality: "video", task: "text-to-video", endpoint: "a/b/text-to-video" }) === "text-to-video")

// watch-list: only supported makers, newest first, one model offered by two providers counts once
{
  const rec = (id: string, provider: string, modality: ModelRecord["modality"], version?: number[], updatedAt?: string) => ({ id: `${provider}/${id}`, endpoint: id, provider, modality, version, updatedAt }) as unknown as ModelRecord
  check("watch-list: Wan, Kling, Claude and FLUX endpoints are recognised", lineOf({ endpoint: "wan/v2.6/image-to-video", modality: "video" })?.id === "wan" && lineOf({ endpoint: "fal-ai/kling-video/v3/pro/text-to-video", modality: "video" })?.id === "kling" && lineOf({ endpoint: "anthropic/claude-sonnet-5.5", modality: "text" })?.id === "chat-anthropic" && lineOf({ endpoint: "fal-ai/flux-2-pro", modality: "image" })?.id === "flux")
  check("watch-list: a LoRA adapter or batch copy is not a model of the line", lineOf({ endpoint: "fal-ai/wan-t2v-lora", modality: "video" }) === undefined && lineOf({ endpoint: "openai/gpt-6.1-sol:batch", modality: "text" }) === undefined)
  check("watch-list: an unknown maker is left out", lineOf({ endpoint: "fal-ai/some-new-thing/text-to-video", modality: "video" }) === undefined)
  check("watch-list: the same line in another kind of output does not match", lineOf({ endpoint: "wan/v2.6/image-to-video", modality: "image" })?.id !== "wan")
  const pool = [rec("wan/v2.5/text-to-video", "fal", "video"), rec("wan/v2.7/text-to-video", "fal", "video"), rec("wan/v2.6/text-to-video", "fal", "video"), rec("fal-ai/other/text-to-video", "fal", "video")]
  const picked = selectWatched(pool)
  check("watch-list: newest version of a line comes first and strangers are reported", picked.kept[0]!.endpoint === "wan/v2.7/text-to-video" && picked.unmatched.length === 1, picked.kept.map((r) => r.endpoint))
  const two = selectWatched([...Array.from({ length: 15 }, (_, n) => rec(`fal-ai/flux-${n + 1}`, "fal", "image", [n + 1])), rec("black-forest-labs/flux-schnell", "replicate", "image", [1])])
  check("watch-list: another provider's models never push a provider's own out of a line", two.kept.some((r) => r.provider === "replicate") && two.kept.filter((r) => r.provider === "fal").length === 14, two.kept.length)
}

// Pinterest through Composio: the answers are read wherever they are wrapped
{
  const pin = { id: "p1", title: "Moody living room", description: "warm lamp light", link: "https://example.com/a", board_id: "b1", media: { media_type: "image", images: { "150x150": { url: "s.jpg", width: 150, height: 150 }, "400x300": { url: "m.jpg", width: 400, height: 300 }, "600x": { url: "l.jpg", width: 600, height: 900 }, originals: { url: "o.jpg", width: 1800, height: 2700 } } } }
  const wrapped = { data: { items: [pin], bookmark: "next-page" }, successful: true }
  const pins = parsePins(wrapped.data)
  check("pinterest: a pin is read with a small and a large picture", pins.length === 1 && pins[0]!.thumb === "m.jpg" && pins[0]!.image === "o.jpg" && pins[0]!.title === "Moody living room", pins)
  check("pinterest: the next page marker is found", findBookmark(wrapped.data) === "next-page")
  check("pinterest: the list is found under another wrapper too", parsePins({ response_data: { items: [pin] } }).length === 1 && parsePins([pin]).length === 1)
  check("pinterest: a video pin is marked", parsePins([{ ...pin, media: { media_type: "video", cover_image_url: "c.jpg" } }])[0]?.isVideo === true && pinPictures({ cover_image_url: "c.jpg" }).thumb === "c.jpg")
  const boards = parseBoards({ items: [{ id: "b1", name: "Interiors", privacy: "SECRET", pin_count: 42, media: { image_cover_url: "cover.jpg" } }, { id: "", name: "broken" }] })
  check("pinterest: boards keep name, count, privacy and cover, and broken rows are dropped", boards.length === 1 && boards[0]!.pinCount === 42 && boards[0]!.privacy === "SECRET" && boards[0]!.cover === "cover.jpg", boards)
}

// plans: the Agent and building Apps are paid; everything else is on the Free plan
check("plans: Free has no Agent and no App builder, Paid has both", planHas("free", "agent") === false && planHas("free", "buildApps") === false && planHas("paid", "agent") === true && planHas("paid", "buildApps") === true)

// license: a key is a signed note, checked with the public key the app carries
{
  check("license: a made-up key is refused", (await verifyLicense("GC-eyJwbGFuIjoicGFpZCJ9.AAAA")) === null && (await verifyLicense("hello")) === null && (await verifyLicense("")) === null)
  const priv = new URL("../.license/private.jwk.json", import.meta.url)
  if (fs.existsSync(priv)) {
    const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url")
    const key = await crypto.subtle.importKey("jwk", JSON.parse(fs.readFileSync(priv, "utf8")), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])
    const payload = new TextEncoder().encode(JSON.stringify({ plan: "paid", licensee: "Test <t@example.com>", issued: "2026-10-10" }))
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, payload)
    const good = `GC-${b64(payload)}.${b64(signature)}`
    const info = await verifyLicense(good)
    check("license: a key signed with the private key is accepted and says who it is for", info?.plan === "paid" && info.licensee === "Test <t@example.com>", info)
    const forged = `GC-${b64(new TextEncoder().encode(JSON.stringify({ plan: "paid", licensee: "Someone Else", issued: "2026-10-10" })))}.${b64(signature)}`
    check("license: changing the note breaks the signature", (await verifyLicense(forged)) === null)
  }
}

// picker badges: what the row shows under a model name, most important first, and nothing that is not known
{
  const { rowChips, splitChips } = await import("../src/lib/registry/summary.ts")
  const base = (snapshotJson as unknown as { models: ModelRecord[] }).models.find((m) => m.modality === "video")!
  const props = (extra: Record<string, unknown>) => ({ ...base.params, properties: { ...base.params.properties, ...extra } }) as ModelRecord["params"]
  const refs = (over: Record<string, unknown>) => ({ start: false, end: false, images: 0, videos: 0, audios: 0, elements: false, stated: true, ...over })
  const full = rowChips({ ...base, summary: { maxResolution: "4K", maxSeconds: 15, audio: true, refs: refs({ start: true, end: true, images: 9, videos: 3, audios: 3 }) } as ModelRecord["summary"], params: props({ resolution: { type: "string", enum: ["480p", "1080p", "4k"] }, duration: { type: "number", enum: [5, 10, 15] } }) })
  check("chips: exact and in order of importance", full.slice(0, 5).join("|") === "Start/End|9 refs|480p-4K|5-15s|Audio" && full.slice(5).join("|") === "Video refs|Audio refs|Seed", full)
  check("chips: no task label and no No audio chip", !full.some((c) => /image|text|no audio/i.test(c)))
  const { shown, more } = splitChips(full)
  check("chips: five stay on the row and the rest wait behind +N", shown.length === 5 && more.length === 3 && splitChips(shown).more.length === 0)
  const one = rowChips({ ...base, summary: { maxResolution: "1080p", refs: refs({ start: true }) } as ModelRecord["summary"], params: props({ resolution: { type: "string", enum: ["1080p"] }, duration: { type: "number", enum: [8] } }) })
  check("chips: one size and one length show as they are", one.join("|") === "Start|1080p|8s|Seed", one)
  const top = rowChips({ ...base, summary: { maxSeconds: 30 } as ModelRecord["summary"], params: { type: "object", properties: { duration: { type: "number", maximum: 30 } } } as ModelRecord["params"] })
  check("chips: only a top length reads Up to", top.join("|") === "Up to 30s", top)
  const none = rowChips({ ...base, summary: undefined, params: { type: "object", properties: {} } })
  check("chips: nothing is shown for what is not known, and no run time before the first run", none.length === 0, none)
  const plain = rowChips({ ...base, summary: { refs: refs({ images: 1, stated: false }) } as ModelRecord["summary"], params: { type: "object", properties: {} } })
  check("chips: an unstated reference limit reads Refs", plain.join("|") === "Refs", plain)
}

console.log(failed === 0 ? `all ${passed} checks passed` : `${failed} failed, ${passed} passed`)
process.exit(failed === 0 ? 0 : 1)
