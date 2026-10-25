import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { auditSheet } from "../src/lib/sheet/audit.ts"
import { jobOf } from "../src/lib/sheet/jobs.ts"
import { buildSheet } from "../src/lib/sheet/merge.ts"
import { parseFalModels, parseFalPrices } from "../src/lib/sheet/sources/fal.ts"
import { pagePriceFact } from "../src/lib/sheet/sources/falPage.ts"
import { parseLitellm, priceOfEntry, splitKey } from "../src/lib/sheet/sources/litellm.ts"
import type { Fact, MakerList, Precedence } from "../src/lib/sheet/types.ts"

let passed = 0
const check = (name: string, fn: () => void) => {
  try {
    fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (e) {
    console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : e}`)
    process.exitCode = 1
  }
}

const precedence = JSON.parse(readFileSync("src/lib/sheet/precedence.json", "utf8")) as Precedence

check("LiteLLM keys split into the host and its endpoint", () => {
  assert.deepEqual(splitKey("fal_ai/bytedance/seedance-2.5/text-to-video", "fal_ai"), { host: "fal", endpoint: "bytedance/seedance-2.5/text-to-video" })
  assert.deepEqual(splitKey("gemini-nano-banana-2.1", "gemini"), { host: "gemini", endpoint: "gemini-nano-banana-2.1" })
})

check("every price shape LiteLLM uses for media is read, and none is invented", () => {
  assert.deepEqual(priceOfEntry({ mode: "video_generation", output_cost_per_second: 0.14, output_cost_per_second_480p: 0.08, output_cost_per_second_720p: 0.14 }), { amount: 0.14, unit: "per_second", currency: "USD", note: "480p $0.08, 720p $0.14" })
  assert.equal(priceOfEntry({ mode: "image_generation", output_cost_per_image: 0.04 })?.unit, "per_image")
  assert.equal(priceOfEntry({ mode: "image_generation", input_cost_per_image: 0.06 })?.amount, 0.06)
  assert.equal(priceOfEntry({ mode: "audio_speech", input_cost_per_character: 0.0001 })?.amount, 0.1)
  assert.equal(priceOfEntry({ mode: "audio_transcription", input_cost_per_second: 6.11e-5 })?.unit, "per_second")
  const tokens = priceOfEntry({ mode: "audio_speech", input_cost_per_token: 5e-7, output_cost_per_audio_token: 9e-6 })
  assert.equal(tokens?.unit, "per_million_tokens")
  assert.equal(tokens?.amount, 9)
  assert.equal(priceOfEntry({ mode: "image_generation" }), undefined)
})

check("fal facts: category, status and name; a double listing counts once; an unknown category is not passed on", () => {
  const facts = parseFalModels([
    { endpoint_id: "a/b/text-to-video", metadata: { category: "text-to-video", status: "active", display_name: "A" } },
    { endpoint_id: "a/b/text-to-video", metadata: { category: "text-to-video", status: "active", display_name: "A" } },
    { endpoint_id: "a/c", metadata: { category: "training", status: "active" } },
  ])
  assert.equal(facts.filter((f) => f.endpoint === "a/b/text-to-video" && f.field === "category").length, 1)
  assert.equal(facts.some((f) => f.endpoint === "a/c" && f.field === "category"), false)
  const prices = parseFalPrices([{ endpoint_id: "a/b", unit_price: 0.1, unit: "second", currency: "USD" }, { endpoint_id: "a/c", unit_price: 1, unit: "gpu-hour", currency: "USD" }])
  assert.equal(prices[0]?.value && (prices[0].value as { unit: string }).unit, "per_second")
  assert.equal((prices[1]!.value as { unit: string }).unit, "other")
})

check("a job comes from the host's own endpoint name; an unknown name is 'other', never a guess", () => {
  assert.equal(jobOf("bria/video/background-removal/v3", "video-to-video").job, "remove-background")
  assert.equal(jobOf("topaz/upscale/video/creative", "video-to-video").job, "upscale")
  assert.equal(jobOf("fal-ai/kling-video/o3/pro/video-to-video/edit", "video-to-video").job, "edit")
  assert.equal(jobOf("minimax/h3-max/extend-video", "video-to-video").job, "extend")
  assert.equal(jobOf("fal-ai/elevenlabs/audio-isolation", "audio-to-audio").job, "isolate-voice")
  assert.equal(jobOf("bytedance/seedance-2.5/text-to-video", "text-to-video").job, "generate")
  assert.equal(jobOf("fal-ai/some-model-nobody-named", "video-to-video").job, "other")
})

const list: MakerList = {
  version: 1,
  makers: [
    {
      id: "m",
      name: "Maker",
      models: [
        { id: "m/x/reference-to-video", name: "X", type: "video", category: "reference-to-video", job: "generate", litellm: [], hosts: { fal: ["m/x/reference-to-video"] } },
        { id: "m/x/image-to-video", name: "X", type: "video", category: "image-to-video", job: "generate", litellm: ["fal_ai/m/x/image-to-video"], hosts: { fal: ["m/x/image-to-video"] } },
        { id: "m/y/edit", name: "Y", type: "video", category: "video-to-video", job: "upscale", litellm: [], hosts: { fal: ["m/y/extend-video"] } },
      ],
    },
  ],
}
const fact2 = (source: string, amount: number, confidence: Fact["confidence"]): Fact => ({ host: "fal", endpoint: "m/x/image-to-video", field: "price", value: { amount, unit: "per_second", currency: "USD" }, source, confidence })
const fact = (over: Partial<Fact>): Fact => ({ host: "fal", endpoint: "m/x/image-to-video", field: "category", value: "image-to-video", source: "fal", confidence: "provider", ...over })

check("the maker list decides category and job; sources confirm or contradict, and a contradiction is kept", () => {
  const facts: Fact[] = [
    // fal files reference-to-video under video-to-video: accepted
    fact({ endpoint: "m/x/reference-to-video", value: "video-to-video" }),
    // fal says text-to-video for a declared image-to-video: a conflict
    fact({ value: "text-to-video" }),
    fact({ endpoint: "m/y/extend-video", value: "video-to-video" }),
  ]
  const sheet = buildSheet(list, facts, precedence)
  const ref = sheet.find((m) => m.id === "m/x/reference-to-video")!.listings[0]!
  assert.equal(ref.category.value, "reference-to-video")
  assert.equal(ref.category.conflicts, undefined)
  const i2v = sheet.find((m) => m.id === "m/x/image-to-video")!.listings[0]!
  assert.equal(i2v.category.value, "image-to-video")
  assert.deepEqual(i2v.category.conflicts, [{ source: "fal", value: "text-to-video" }])
  // declared upscale, but the endpoint name says extend: the job conflict is kept
  const y = sheet.find((m) => m.id === "m/y/edit")!.listings[0]!
  assert.equal(y.job.value, "upscale")
  assert.equal(y.job.conflicts?.[0]?.value, "extend")
})

check("price follows the configured order; no source means no price", () => {
  const facts: Fact[] = [
    fact({ field: "price", value: { amount: 0.5, unit: "per_second", currency: "USD" }, source: "fal" }),
    fact({ field: "price", value: { amount: 0.4, unit: "per_second", currency: "USD" }, source: "litellm", confidence: "community" }),
  ]
  const sheet = buildSheet(list, facts, precedence)
  const i2v = sheet.find((m) => m.id === "m/x/image-to-video")!.listings[0]!
  assert.equal(i2v.price.source, "litellm")
  assert.equal(i2v.price.value?.amount, 0.4)
  assert.equal(sheet.find((m) => m.id === "m/x/reference-to-video")!.listings[0]!.price.value, undefined)
})

check("fal's page price is read without a key, and two sources that disagree are both kept", () => {
  const fact = pagePriceFact("m/x/image-to-video", { unit: "per_second", amount: 0.05, rules: [{ when: { resolution: "480p" }, amount: 0.05 }, { when: { resolution: "720p" }, amount: 0.1 }] })
  assert.equal((fact!.value as { note: string }).note, "480p $0.05, 720p $0.1")
  assert.equal(pagePriceFact("a", { unit: "mystery", amount: 1 }), undefined)
  const facts: Fact[] = [
    fact2("litellm", 0.473, "community"),
    { ...fact!, host: "fal", endpoint: "m/x/image-to-video" },
  ]
  const sheet = buildSheet(list, facts, precedence)
  const price = sheet.find((m) => m.id === "m/x/image-to-video")!.listings[0]!.price
  assert.equal(price.source, "litellm", "LiteLLM is first")
  assert.equal(price.conflicts?.length, 1)
  assert.equal(price.conflicts?.[0]?.source, "fal-page")
  // sources that agree raise no conflict
  const agree = buildSheet(list, [fact2("litellm", 0.0505, "community"), { ...fact!, host: "fal", endpoint: "m/x/image-to-video" }], precedence)
  assert.equal(agree.find((m) => m.id === "m/x/image-to-video")!.listings[0]!.price.conflicts, undefined)
})

check("a LiteLLM key adds its own listing, and the audit names what is missing", () => {
  const facts: Fact[] = [fact({ host: "fal", endpoint: "m/x/image-to-video", field: "price", value: { amount: 1, unit: "per_second", currency: "USD" }, source: "litellm", via: "fal_ai/m/x/image-to-video", confidence: "community" })]
  const sheet = buildSheet(list, facts, precedence)
  const audit = auditSheet(sheet)
  assert.equal(audit.models, 3)
  assert.ok(audit.noPrice.length >= 2)
  assert.ok(audit.notFound.length >= 2, "endpoints no source has seen are reported")
})

check("the real maker list is well formed: unique ids, a category and a job for every model, an endpoint somewhere", () => {
  const real = JSON.parse(readFileSync("src/lib/sheet/makers.json", "utf8")) as MakerList
  const ids = real.makers.flatMap((m) => m.models.map((x) => x.id))
  assert.equal(new Set(ids).size, ids.length)
  for (const mk of real.makers) {
    for (const m of mk.models) {
      assert.ok(m.category && m.job && m.type, `${m.id} lacks a category, job or type`)
      assert.ok(m.litellm.length + Object.values(m.hosts).flat().length > 0, `${m.id} has no endpoint anywhere`)
    }
  }
})

import {
  completionCost,
  dropRejectedParamsOnError,
  enrichRecordWithLiteLLM,
  extractUsageFromRaw,
  getSupportedOpenAIParams,
  parseLiteLLMDatabase,
  translateParamsToModelSchema,
  withStandardParams,
} from "../src/lib/litellm/index.ts"
import { rowChips } from "../src/lib/registry/summary.ts"
import { paramVerdict } from "../src/lib/registry/param-checks.ts"
import { actualCostOf } from "../src/lib/ledger/actual-cost.ts"

check("LiteLLM engine parses real cached database across all 5 studio providers and all 4 modalities", () => {
  const rawDb = JSON.parse(readFileSync("scripts/.cache/litellm.json", "utf8"))
  const parsed = parseLiteLLMDatabase(rawDb, { onlySupportedProviders: true })
  assert.ok(parsed.length > 500, `Expected >500 parsed models across 5 studio providers, got ${parsed.length}`)
  const modalities = new Set(parsed.map((p) => p.modality))
  assert.ok(modalities.has("text") && modalities.has("image") && modalities.has("video") && modalities.has("audio"), `Modalities: ${[...modalities].join(",")}`)
  const providers = new Set(parsed.map((p) => p.provider))
  assert.ok(providers.has("fal") && providers.has("replicate") && providers.has("openrouter") && providers.has("gemini") && providers.has("openai"), `Providers: ${[...providers].join(",")}`)
})

check("LiteLLM params layer translates OpenAI-standard params and auto-drops rejected params on 400/422 errors", () => {
  const baseVideoModel = {
    id: "fal:kling-v2",
    endpoint: "fal-ai/kling-video/v2/master/image-to-video",
    provider: "fal" as const,
    name: "Kling 2.0",
    family: "kling",
    logoKey: "kling",
    modality: "video" as const,
    task: "image-to-video",
    inputs: ["text" as const, "image" as const],
    params: { type: "object" as const, properties: {} },
    price: { unit: "per_second" as const, amount: 0.14, source: "api" as const, fetchedAt: "" },
    status: "active" as const,
  }
  const enriched = withStandardParams(baseVideoModel, {
    vision: true,
    reasoning: false,
    functionCalling: false,
    webSearch: false,
    audioInput: false,
    audioOutput: true,
    videoInput: false,
    promptCaching: false,
    responseSchema: false,
    systemMessages: false,
  })
  const supported = getSupportedOpenAIParams(enriched)
  assert.ok(supported.includes("aspect_ratio") && supported.includes("duration") && supported.includes("image_url"))

  const customRecord = {
    ...baseVideoModel,
    params: {
      type: "object" as const,
      properties: {
        duration_seconds: { type: "number" as const },
        image_url: { type: "string" as const },
      },
    },
  }
  const translated = translateParamsToModelSchema(customRecord, {
    prompt: "cinematic ocean",
    duration: "5",
    image_url: "https://example.com/a.png",
  })
  assert.equal(translated.duration_seconds, 5)
  assert.equal(translated.image_url, "https://example.com/a.png")

  const dropped = dropRejectedParamsOnError(
    customRecord,
    { prompt: "hello", negative_prompt: "blurry", cfg_scale: 7 },
    '422 Unprocessable Entity: Unknown parameter "negative_prompt"',
  )
  assert.equal(dropped.shouldRetry, true)
  assert.deepEqual(dropped.droppedFields, ["negative_prompt"])
  assert.equal(dropped.cleanedInput.negative_prompt, undefined)
  assert.equal(dropped.cleanedInput.prompt, "hello")

  // a bad value retries without the field once, but does not mark the field as unsupported
  const valueRecord = { ...customRecord, id: "test:value-error" }
  const badValue = dropRejectedParamsOnError(
    valueRecord,
    { prompt: "hello", cfg_scale: 99 },
    "422 Unprocessable Entity: cfg_scale must be one of 1, 5, 7",
  )
  assert.equal(badValue.shouldRetry, true)
  assert.deepEqual(badValue.droppedFields, ["cfg_scale"])
  assert.equal(paramVerdict(valueRecord.id, "cfg_scale"), undefined)
})

check("a price-list estimate is not reported as an actual cost", () => {
  const rec = { provider: "fal" as const, endpoint: "fal-ai/x", modality: "image" as const, price: { unit: "per_image", amount: 0.04 } }
  assert.equal(actualCostOf(rec, { images: [{ url: "x" }] }, { n: 1 }), null)
})

check("LiteLLM completionCost & extractUsageFromRaw calculate exact token, cached-token, image, video, and character costs", () => {
  const tokenRecord = {
    id: "openai:gpt-4o",
    endpoint: "gpt-4o",
    provider: "openai" as const,
    name: "GPT-4o",
    family: "gpt-4o",
    logoKey: "openai",
    modality: "text" as const,
    inputs: ["text" as const],
    params: { type: "object" as const, properties: {} },
    price: { unit: "per_1m_tokens" as const, amount: 2.5, outputAmount: 10, cachedAmount: 0.25, source: "api" as const, fetchedAt: "" },
    status: "active" as const,
  }
  const rawResp = { usage: { prompt_tokens: 100_000, completion_tokens: 50_000, prompt_tokens_details: { cached_tokens: 40_000 } } }
  const usage = extractUsageFromRaw(rawResp)
  assert.deepEqual(usage, { promptTokens: 100_000, completionTokens: 50_000, reasoningTokens: 0, cachedTokens: 40_000 })
  const cost = completionCost(tokenRecord, rawResp)
  // 60k uncached * $2.5/1M ($0.15) + 40k cached * $0.25/1M ($0.01) + 50k output * $10/1M ($0.50) = $0.66
  assert.equal(cost?.usd, 0.66)

  const videoRecord = {
    ...tokenRecord,
    id: "fal:veo-3",
    provider: "fal" as const,
    modality: "video" as const,
    params: {
      type: "object" as const,
      properties: {
        resolution: { type: "string" as const, enum: ["720p", "1080p"] },
        generate_audio: { type: "boolean" as const },
        duration: { type: "integer" as const, enum: [5, 8] },
      },
    },
    price: {
      unit: "per_second" as const,
      amount: 0.1,
      rules: [{ when: { resolution: "1080p", generate_audio: true }, amount: 0.25 }],
      source: "api" as const,
      fetchedAt: "",
    },
  }
  assert.equal(completionCost(videoRecord, {}, { duration: 8, resolution: "1080p", generate_audio: true })?.usd, 2.0)
})

check("enrichRecordWithLiteLLM populates capability badges and rowChips displays them", () => {
  const rec = enrichRecordWithLiteLLM(
    {
      id: "openai:gpt-4o",
      canonicalId: "gpt-4o",
      provider: "openai",
      modality: "text",
      name: "GPT-4o",
      inputs: ["text"],
      params: { type: "object", properties: {} },
      price: { unit: "per_1m_tokens", amount: null, source: "unknown" },
      runnable: true,
    },
    {
      litellmKey: "gpt-4o",
      provider: "openai",
      endpoint: "gpt-4o",
      canonicalId: "gpt-4o",
      modality: "text",
      category: "chat",
      capabilities: {
        vision: true,
        reasoning: true,
        functionCalling: true,
        webSearch: true,
        audioInput: false,
        audioOutput: false,
        videoInput: false,
        promptCaching: true,
        responseSchema: true,
        systemMessages: true,
        maxInputTokens: 128_000,
      },
      price: { unit: "per_1m_tokens", amount: 2.5, outputAmount: 10, source: "api" },
    },
  )
  const chips = rowChips(rec)
  assert.ok(chips.includes("128K context"))
  assert.ok(chips.includes("Vision"))
  assert.ok(chips.includes("Reasoning"))
  assert.ok(chips.includes("Tools"))
  assert.ok(chips.includes("Web search"))
  assert.equal(rec.price.amount, 2.5)
})

console.log(`\n${passed} passed`)
if (!process.exitCode) console.log("all passed")

