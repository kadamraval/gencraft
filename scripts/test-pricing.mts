import { estimateRun, standardRun } from "../src/lib/registry/price"
import { parseReplicatePrice, priceKindOf } from "../src/lib/registry/adapters/replicate"
import type { ModelRecord, ParamProperty, PriceRule } from "../src/lib/registry/types"

let fails = 0
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`)
  if (!ok) fails++
}
const near = (a: number | null, b: number, eps = 0.0005) => a !== null && Math.abs(a - b) <= eps

const rec = (o: { provider?: string; endpoint: string; modality: ModelRecord["modality"]; unit: ModelRecord["price"]["unit"]; amount: number; out?: number; rules?: PriceRule[]; props?: Record<string, ParamProperty>; max?: number }): ModelRecord =>
  ({
    id: `${o.provider ?? "replicate"}/${o.endpoint}`,
    endpoint: o.endpoint,
    name: o.endpoint,
    provider: o.provider ?? "replicate",
    modality: o.modality,
    family: o.endpoint,
    logoKey: "",
    inputs: ["text"],
    params: { type: "object", properties: o.props ?? {} },
    price: { unit: o.unit, amount: o.amount, outputAmount: o.out, rules: o.rules, source: "scraped", fetchedAt: "" },
    summary: o.max ? { maxSeconds: o.max } : undefined,
    status: "active",
  }) as ModelRecord

const res = (e: string[]): ParamProperty => ({ type: "string", enum: e })

// Per second by tier: Wan 3.0 prime (Alibaba: $0.068 / $0.14 / $0.28 per second)
const wan = rec({ endpoint: "alibaba/wan-3-prime", modality: "video", unit: "per_second", amount: 0.068, rules: [{ when: { resolution: "480p" }, amount: 0.068 }, { when: { resolution: "720p" }, amount: 0.14 }, { when: { resolution: "1080p" }, amount: 0.28 }], props: { resolution: res(["480p", "720p", "1080p"]), duration: { type: "integer", minimum: 2, maximum: 30 } } })
check("per second by resolution: Wan 3.0 prime 5 s 1080p = $1.40", near(estimateRun(wan, { resolution: "1080p", duration: 5 }).usd, 1.4))
check("the cheapest tier is not used for a dearer choice", near(estimateRun(wan, { resolution: "720p", duration: 5 }).usd, 0.7))
check("the working is shown", estimateRun(wan, { resolution: "1080p", duration: 5 }).breakdown === "5 s × $0.28/s", String(estimateRun(wan, { resolution: "1080p", duration: 5 }).breakdown))

// A model that picks its own length is priced at the most it could run
const auto = rec({ endpoint: "x/seedance", modality: "video", unit: "per_second", amount: 0.1, max: 30, props: { duration: { type: "integer", minimum: -1, maximum: 30 } } })
const a = estimateRun(auto, { duration: -1 })
check("an open length is priced at the most and says so", near(a.usd, 3) && a.upTo === true && a.display.startsWith("up to"), a.display)

// Per clip by length: Hailuo 2.3 (Replicate: 768P 6 s $0.28, 10 s $0.56, 1080P 6 s $0.49)
const hailuo = rec({
  endpoint: "minimax/hailuo-2.3",
  modality: "video",
  unit: "per_run",
  amount: 0.28,
  rules: [
    { when: { resolution: "768P", second_of_output_video: 6 as never }, amount: 0.28 },
    { when: { resolution: "768P", second_of_output_video: 10 as never }, amount: 0.56 },
    { when: { resolution: "1080P", second_of_output_video: 6 as never }, amount: 0.49 },
  ],
  props: { resolution: res(["768P", "1080P"]), duration: { type: "integer", enum: [6, 10] } },
})
check("a clip price follows its length: 6 s = $0.28, 10 s = $0.56", near(estimateRun(hailuo, { resolution: "768P", duration: 6 }).usd, 0.28) && near(estimateRun(hailuo, { resolution: "768P", duration: 10 }).usd, 0.56))
check("and its resolution: 1080P 6 s = $0.49", near(estimateRun(hailuo, { resolution: "1080P", duration: 6 }).usd, 0.49))

// Sound on or off as a variant: Veo 3.1 ($0.40 with sound, $0.20 without; Replicate rules)
const veo = rec({ endpoint: "google/veo-3.1", modality: "video", unit: "per_second", amount: 0.2, rules: [{ when: { model_variant: "with_audio" }, amount: 0.4 }, { when: { model_variant: "without_audio" }, amount: 0.2 }], props: { generate_audio: { type: "boolean", default: true }, duration: { type: "integer", enum: [4, 6, 8] } } })
check("sound on is the with-audio price: 8 s = $3.20", near(estimateRun(veo, { generate_audio: true, duration: 8 }).usd, 3.2))
check("sound off is the cheaper one: 8 s = $1.60", near(estimateRun(veo, { generate_audio: false, duration: 8 }).usd, 1.6))

// A variant that is a field of the model: Kling standard / pro, with sound
const kling = rec({
  endpoint: "kwaivgi/kling-v3-video",
  modality: "video",
  unit: "per_second",
  amount: 0.168,
  rules: [
    { when: { model_variant: "standard" }, amount: 0.168 },
    { when: { generate_audio: true as never, model_variant: "standard" }, amount: 0.252 },
    { when: { model_variant: "pro" }, amount: 0.224 },
    { when: { generate_audio: true as never, model_variant: "pro" }, amount: 0.336 },
  ],
  props: { mode: res(["standard", "pro"]), generate_audio: { type: "boolean" }, duration: { type: "integer", minimum: 3, maximum: 15 } },
})
check("the variant is read from the model's own mode field", near(estimateRun(kling, { mode: "pro", generate_audio: true, duration: 5 }).usd, 1.68) && near(estimateRun(kling, { mode: "standard", generate_audio: false, duration: 5 }).usd, 0.84), String(estimateRun(kling, { mode: "pro", generate_audio: true, duration: 5 }).usd))

// A video going in changes the price: Seedance (Replicate: 480p $0.1028/s without, $0.4304/s with)
const seed = rec({ endpoint: "bytedance/seedance-2.5", modality: "video", unit: "per_second", amount: 0.1028, rules: [{ when: { model_variant: "non_video_in", resolution: "480p" }, amount: 0.1028 }, { when: { model_variant: "video_in", resolution: "480p" }, amount: 0.4304 }], props: { resolution: res(["480p", "720p"]), duration: { type: "integer", minimum: 4, maximum: 30 } } })
check("a source video selects the video-in price", near(estimateRun(seed, { resolution: "480p", duration: 5 }, { sourceVideo: true }).usd, 2.152) && near(estimateRun(seed, { resolution: "480p", duration: 5 }, { sourceVideo: false }).usd, 0.514))

// When the settings cannot say which tier, the lowest is shown and marked
const luma = rec({ endpoint: "luma/ray-3.2", modality: "video", unit: "per_run", amount: 0.15, rules: [{ when: { model_variant: "sdr", resolution: "540p" }, amount: 0.15 }, { when: { model_variant: "hdr", resolution: "540p" }, amount: 0.3 }], props: { resolution: res(["540p"]) } })
const open = estimateRun(luma, { resolution: "540p" })
check("an undecided tier is shown as 'from' the lowest", near(open.usd, 0.15) && open.from === true && open.display.startsWith("from"), open.display)

// Per image by size and by quality
const nano = rec({ endpoint: "google/nano-banana-2.1", modality: "image", unit: "per_image", amount: 0.0336, rules: [{ when: { resolution: "1K" }, amount: 0.0336 }, { when: { resolution: "2K" }, amount: 0.0504 }, { when: { resolution: "4K" }, amount: 0.1134 }], props: { resolution: res(["1K", "2K", "4K"]) } })
check("per image by size: Nano Banana 2.1 1K = $0.0336, 4K = $0.1134", near(estimateRun(nano, { resolution: "1K" }).usd, 0.0336, 0.00001) && near(estimateRun(nano, { resolution: "4K" }).usd, 0.1134, 0.00001))
const flat = rec({ endpoint: "x/img", modality: "image", unit: "per_image", amount: 0.05, props: { num_images: { type: "integer", minimum: 1, maximum: 4 } } })
check("several images multiply", near(estimateRun(flat, { num_images: 4 }).usd, 0.2))

// Tokens with a stated fact
const omni = rec({ provider: "gemini", endpoint: "gemini-omni-1.1-flash", modality: "video", unit: "per_1m_tokens", amount: 1.5, out: 17.5, props: { duration: { type: "integer", minimum: 1, maximum: 10 } } })
check("Gemini Omni video: 5,792 tokens a second at $17.50 per million = about $0.10 a second", near(estimateRun(omni, { duration: 5 }).usd, 0.5068, 0.001) && estimateRun(omni, { duration: 5 }).approximate)
const tts = rec({ provider: "gemini", endpoint: "gemini-3.8-flash-tts", modality: "audio", unit: "per_1m_tokens", amount: 0.5, out: 9 })
check("Gemini TTS: 25 tokens a second, 1,000 characters is about 67 s = $0.015", near(estimateRun(tts, {}, { promptChars: 1000 }).usd, 0.015, 0.001), String(estimateRun(tts, {}, { promptChars: 1000 }).usd))
const gpt = rec({ provider: "openai", endpoint: "gpt-image-2.5-sunburst", modality: "image", unit: "per_1m_tokens", amount: 30, props: { quality: res(["low", "medium", "high"]) } })
check("GPT Image tokens by quality: medium = $0.047", near(estimateRun(gpt, { quality: "medium" }).usd, 0.047, 0.0005), String(estimateRun(gpt, { quality: "medium" }).usd))
check("a token price with no fact is left open, not invented", estimateRun(rec({ provider: "openrouter", endpoint: "x/unknown-image", modality: "image", unit: "per_1m_tokens", amount: 10 }), {}).usd === null)

// Per thousand characters, using the real text length
const eleven = rec({ endpoint: "elevenlabs/v3", modality: "audio", unit: "per_1k_chars", amount: 0.1 })
check("speech by the thousand characters follows the text: 2,500 characters = $0.25", near(estimateRun(eleven, {}, { promptChars: 2500 }).usd, 0.25))
check("with no text yet it assumes 500 characters and says so", near(estimateRun(eleven, {}).usd, 0.05) && estimateRun(eleven, {}).approximate)

// What a row shows
const std = standardRun(wan)
check("a row shows the price of a standard run", std.label.startsWith("5 s"), std.label)
check("a speech row is per 1K characters", standardRun(eleven).label === "1K characters" && near(standardRun(eleven).estimate.usd, 0.1))
check("a model that leaves the length open is shown at 5 s, not the most", near(standardRun(auto).estimate.usd, 0.5), String(standardRun(auto).estimate.usd))

// Reading what Replicate states: the title decides the unit and the scale
const kind = (title: string, metric = "") => priceKindOf({ title, metric })
check("per thousand characters", kind("per thousand input characters", "character_input_count").unit === "per_1k_chars" && kind("per thousand input characters", "character_input_count").scale === 1)
check("per thousand tokens is a thousand times a per-million figure", kind("per thousand input tokens", "token_input_count").scale === 1000 && kind("per million input tokens", "token_input_count").scale === 1)
check("per output image, per output audio file, per second", kind("per output image", "image_output_count").unit === "per_image" && kind("per output audio file", "audio_output_count").unit === "per_run" && kind("per second of output video", "video_output_duration_seconds").unit === "per_second")
const page = (tiers: object[]) => `<script>"billingConfig": ${JSON.stringify({ current_tiers: tiers })}, "price": "x"</script>`
const eleven3 = parseReplicatePrice(page([{ criteria: [], prices: [{ metric: "character_input_count", price: "$0.10", title: "per thousand input characters" }] }]))!
check("ElevenLabs v3 is $0.10 per thousand characters, not per run", eleven3.unit === "per_1k_chars" && near(eleven3.amount, 0.1), JSON.stringify(eleven3))
const minimax = parseReplicatePrice(page([{ criteria: [], prices: [{ metric: "token_input_count", price: "$0.10", title: "per thousand input tokens" }] }]))!
check("MiniMax speech is $0.10 per thousand tokens = $100 per million, not $0.10", minimax.unit === "per_1m_tokens" && near(minimax.amount, 100), JSON.stringify(minimax))
const gtts = parseReplicatePrice(page([{ criteria: [], prices: [{ metric: "token_input_count", price: "$2", title: "per million input tokens" }, { metric: "token_output_count", price: "$0.04", title: "per thousand output tokens" }] }]))!
check("Gemini TTS: $2 per million in, $0.04 per thousand out = $40 per million out", near(gtts.amount, 2) && near(gtts.outputAmount ?? 0, 40), JSON.stringify(gtts))
const lyria = parseReplicatePrice(page([{ criteria: [], prices: [{ metric: "audio_output_count", price: "$0.04", title: "per output audio file" }] }]))!
check("Lyria is $0.04 per file", lyria.unit === "per_run" && near(lyria.amount, 0.04))

import { parseHardwarePrice, parseReplicatePublicSchema, recordFromReplicate } from "../src/lib/registry/adapters/replicate"
import { parseFalPrice } from "../src/lib/registry/adapters/fal-price"
import { mapOpenRouterModel, mapOpenRouterVideoModel } from "../src/lib/registry/adapters/openrouter"

// Phase 2: Replicate public schema + hardware price + OpenAI-standard parameter fallback
const hwHtml = `<script type="application/json">{"billingConfig": null, "price": "$0.000975 per second", "p50price": "$0.0195"}</script>`
const hwPrice = parseHardwarePrice(hwHtml)!
check("Replicate hardware price extracts computeSecond ($0.000975/s) and p50price ($0.0195)", near(hwPrice.amount, 0.0195) && near(hwPrice.computeSecond, 0.000975, 0.000001))

const schemaHtml = `<script type="application/json">{"version": {"id": "0123456789abcdef0123456789abcdef"}, "dereferenced_openapi_schema": {"components": {"schemas": {"Input": {"type": "object", "properties": {"prompt": {"type": "string"}, "aspect_ratio": {"type": "string", "enum": ["16:9", "9:16"]}}}, "Output": {"type": "string", "format": "uri"}}}}}</script>`
const pubSchema = parseReplicatePublicSchema(schemaHtml)!
check("Replicate public page schema scraper extracts dereferenced_openapi_schema without API token", Boolean(pubSchema?.openapi_schema?.components?.schemas?.Input) && pubSchema.versionId === "0123456789abcdef0123456789abcdef")

const noSchemaRep = recordFromReplicate(
  { owner: "bytedance", name: "seedance-2.5", latest_version: { id: "v1", openapi_schema: { components: { schemas: { Output: { type: "string", format: "uri" } } } } } },
  { modality: "video", task: "text-to-video" },
  new Date().toISOString(),
)!
check("Replicate model without Input schema gets OpenAI-standard video params via LiteLLM layer", Boolean(noSchemaRep?.params.properties.aspect_ratio && noSchemaRep?.params.properties.duration && noSchemaRep?.params.properties.resolution))

// Phase 2: Fal combined resolution + audio pricing & OpenRouter video/audio pricing
const falCombo = parseFalPrice("Your request will cost $0.10 per second for 720p ($0.15 with audio), $0.20 per second for 1080p ($0.30 with audio)")!
check("Fal combined resolution + audio price extracts 4 tier rules", falCombo.unit === "per_second" && near(falCombo.amount, 0.1) && falCombo.rules?.length === 4)

const orVideo = mapOpenRouterVideoModel(
  {
    id: "bytedance/seedance-2.0",
    name: "ByteDance: Seedance 2.0",
    supported_resolutions: ["720p", "1080p"],
    pricing_skus: { duration_seconds_without_audio_720p: "0.12", duration_seconds_with_audio_1080p: "0.28" },
  },
  new Date().toISOString(),
)!
check("OpenRouter video model maps to video modality with per_second tier rules", orVideo.modality === "video" && near(orVideo.price.amount, 0.12) && orVideo.price.rules?.length === 2)

const orAudio = mapOpenRouterModel(
  {
    id: "openai/gpt-4o-audio-preview",
    name: "OpenAI: GPT-4o Audio",
    architecture: { input_modalities: ["text", "audio"], output_modalities: ["text", "audio"] },
    pricing: { prompt: "0.0000025", audio_output: "0.00008" },
  },
  new Date().toISOString(),
)!
check("OpenRouter audio model maps to audio modality with voice param and token rate", orAudio.modality === "audio" && Boolean(orAudio.params.properties.voice) && near(orAudio.price.outputAmount ?? 0, 80))

// fal's own pricing notes, as the pages write them
{
  const { parseFalPayload } = await import("../src/lib/registry/adapters/fal-price")
  const first = (s: string) => parseFalPrice(s)
  const pay = first("Your request will cost **$0.07** for every second of output video.")
  check("fal: a price for every second of output video", pay?.unit === "per_second" && near(pay.amount, 0.07))
  const tiers = first("Priced per second of output video, by resolution: 480p at **$0.08**/sec, 720p at **$0.14**/sec, 1080p at **$0.20**/sec")
  check("fal: second-of-video tiers by resolution", tiers?.unit === "per_second" && near(tiers.amount, 0.08) && tiers.rules?.length === 3)
  const mp = first("Your request will cost **$0.08** per started 24 megapixels of output for every precision model. For example, an output up to 24 MP costs $0.08.")
  check("fal: a price for a number of megapixels is a price per megapixel", mp?.unit === "per_megapixel" && near(mp.amount, 0.08 / 24, 0.00001))
  const added = first("Cost is **$0.05** per second of 480p output video (**$0.07** at 720p) plus **$0.01** per second of input video.")
  check("fal: the headline price is taken, not the charge added on top", added?.unit === "per_second" && near(added.amount, 0.05))
  const img = first("Your request will cost **$0.04** (low) or **$0.06** (medium) per image for 1K, and **$0.06** (low) or **$0.08** (medium) per image for 2K, plus **$0.01** per input image.")
  check("fal: quality steps of an image start at the lowest", img?.unit === "per_image" && near(img.amount, 0.04))
  const rate = first("Your request will cost **$0.0013** per compute second.")
  check("fal: time on the machine is shown as its published rate", rate?.computeSecond === 0.0013 && rate.amount === null)
  const tent = first("Tentative pricing is $0.0675+ $(0.0045 x number of additional input images) per output image for total area up to 1536x1536 pixels.")
  check("fal: tentative price per output image", tent?.unit === "per_image" && near(tent.amount, 0.0675))
  const mai = first("Billing uses the provider-reported cost when available. Otherwise: $5 per million text input tokens, $8 per million image input tokens, and $47 per million image output tokens.")
  check("fal: token price with image input and output rates", mai?.unit === "per_1m_tokens" && near(mai.amount, 8) && near(mai.outputAmount ?? 0, 47))
  const gen = first("Text tokens (per 1M): $5.00 input. Image output: ~$0.05 per generated image (billed as 1024 output tokens).")
  check("fal: a price per generated image in words", gen?.unit === "per_image" && near(gen.amount, 0.05))
  const svg = first("Billing is per generated SVG: $0.13 for low, $0.16 for medium, and $0.20 for high quality.")
  check("fal: a price per generated SVG starts at the lowest quality", svg?.unit === "per_image" && near(svg.amount, 0.13))
  const mp1 = first("Pricing starts at $0.03 for the first output megapixel, plus $0.015 per additional input or output megapixel.")
  check("fal: price for the first output megapixel", mp1?.unit === "per_megapixel" && near(mp1.amount, 0.03))
  const vt = first("Billing is calculated per 1,000 video tokens at $0.007 for 480p and 720p.")
  check("fal: price per thousand video tokens", vt?.unit === "per_1m_tokens" && near(vt.amount, 7))
  const fr = first("Your request will cost $0.0225 per 30 frames (Refine Foreground Edges: ON) / $0.015 (Refine: OFF).")
  check("fal: a price per 30 frames is a price per frame", fr?.unit === "per_frame" && near(fr.amount, 0.015 / 30, 0.000001))
  const job = first("With Themis 2 at 30 fps, a 10-second job costs $0.10 up to 1080p or $0.30 at 4K; one minute costs $0.40 or $1.40.")
  check("fal: a job of a stated length gives the price per second", job?.unit === "per_second" && near(job.amount, 0.01, 0.00001))
  const tok = first("Text/thinking tokens (per 1M): **$1.764** input, **$8.823** output. Image tokens (per 1M): $60 output.")
  check("fal: token prices carry input and output", tok?.unit === "per_1m_tokens" && near(tok.amount, 1.764) && near(tok.outputAmount ?? 0, 8.823))
  check("fal: a sentence it cannot place is not priced", first("The price depends on many things and changes often.") === null)
  const html = '..."pricingInfoOverride":"Your request will cost **$0.10** per output video second.","machineType":null...'.split('"').join('\\"')
  const viaPayload = parseFalPayload(html.split('\\"').join('"').replace(/"/g, '\\"'), "fal-ai/lightx/relight")
  check("fal: the pricing note inside the page data is read", viaPayload?.unit === "per_second" && near(viaPayload.amount, 0.1))
  const billing = '..."endpointBilling":{"endpoint":"fal-ai/x","billing_unit":"images","price":0.03,"provider_type":"fal"}...'.replace(/"/g, '\\"')
  const viaBilling = parseFalPayload(billing, "fal-ai/x")
  check("fal: with no note the billing record's unit and price are used", viaBilling?.unit === "per_image" && near(viaBilling.amount, 0.03))
  check("fal: a billing record of another endpoint is not used", parseFalPayload(billing, "fal-ai/other") === null)
}

{
  const { priceFromSkus } = await import("../src/lib/registry/adapters/openrouter")
  const kling = priceFromSkus({ duration_seconds: "0.112", duration_seconds_with_audio: "0.168", text_to_video_duration_seconds_720p: "0.112" }, ["720p"])!
  check("OpenRouter video price list: seconds, with and without sound", kling.unit === "per_second" && near(kling.amount, 0.112) && kling.rules?.some((r) => r.when.generate_audio === true && near(r.amount, 0.168)) === true)
  const grok = priceFromSkus({ cents_per_image_input: "1", cents_per_video_output_second_480p: "8", cents_per_video_output_second_720p: "14" }, ["480p", "720p"])!
  check("OpenRouter video price list: cents a second by resolution, extras for input pictures left out", grok.unit === "per_second" && near(grok.amount, 0.08) && grok.rules?.length === 2)
  const tok = priceFromSkus({ video_tokens: "0.0000107", video_tokens_with_video_input: "0.0000064" })!
  check("OpenRouter video price list: a price per token is a price per million tokens", tok.unit === "per_1m_tokens" && near(tok.amount, 10.7))
  const up = priceFromSkus({ cents_per_megapixel_second_precise: "3.5", cents_per_megapixel_second_creative: "5" })!
  check("OpenRouter video price list: cents per megapixel-second", up.unit === "per_megapixel_second" && near(up.amount, 0.035))
  check("OpenRouter video price list: nothing to read is not a price", priceFromSkus({ minimum_cents_per_generation: "56" }) === null)
}

console.log(fails ? `${fails} FAILED` : "ALL PASS")
process.exit(fails ? 1 : 0)

