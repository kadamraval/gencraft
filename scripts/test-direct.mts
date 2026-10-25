import { estimateRun, standardRun } from "../src/lib/registry/price"
import { geminiAudio, geminiImageBody, geminiImages, geminiSpeechBody, openaiImageFields, openaiSpeechBody, openrouterImageBody, openrouterImages, splitDataUrl } from "../src/lib/registry/direct-requests"
import { geminiImageParams, geminiSpeechParams } from "../src/lib/registry/adapters/gemini-params"
import type { ModelRecord } from "../src/lib/registry/types"

let fails = 0
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`)
  if (!ok) fails++
}
const rec = (endpoint: string, params: ModelRecord["params"]) => ({ endpoint, params }) as Pick<ModelRecord, "endpoint" | "params">

// Gemini images, through the Interactions API
const banana = rec("gemini-nano-banana-2.1", geminiImageParams("gemini-nano-banana-2.1"))
const png = "data:image/png;base64,AAAA"
const body = geminiImageBody(banana, "A fox", { aspect_ratio: "16:9", image_size: "2K", thinking_level: "high", web_search: true, image_search: true }, [png])
check("gemini image: text then each picture with its mime type", JSON.stringify(body.input) === JSON.stringify([{ type: "text", text: "A fox" }, { type: "image", mime_type: "image/png", data: "AAAA" }]))
check("gemini image: ratio and size go in response_format", JSON.stringify(body.response_format) === JSON.stringify({ type: "image", aspect_ratio: "16:9", image_size: "2K" }))
check("gemini image: thinking level and search tool", JSON.stringify(body.generation_config) === JSON.stringify({ thinking_level: "high" }) && JSON.stringify(body.tools) === JSON.stringify([{ type: "google_search", search_types: ["web_search", "image_search"] }]))
const plain = geminiImageBody(banana, "A fox", { aspect_ratio: "auto", image_size: "1K" })
check("gemini image: no pictures sends the prompt as plain text, auto ratio is left out", plain.input === "A fox" && !("aspect_ratio" in (plain.response_format as object)) && !("tools" in plain))
check("gemini image: the model is the record's endpoint", plain.model === "gemini-nano-banana-2.1")

check("gemini params: Flash Lite makes 1K only and thinks minimal or high", JSON.stringify(geminiImageParams("gemini-3.1-flash-lite-image").properties.image_size!.enum) === JSON.stringify(["1K"]) && JSON.stringify(geminiImageParams("gemini-3.1-flash-lite-image").properties.thinking_level!.enum) === JSON.stringify(["minimal", "high"]))
check("gemini params: Nano Banana 2.1 thinks minimal, medium or high (medium)", geminiImageParams("gemini-nano-banana-2.1").properties.thinking_level!.default === "medium" && geminiImageParams("gemini-nano-banana-2.1").properties.thinking_level!.enum!.length === 3)
check("gemini params: Pro has no thinking level", !("thinking_level" in geminiImageParams("gemini-3-pro-image").properties))
check("gemini params: the ratios Google lists for Flash Lite are not untested; the others are", !geminiImageParams("gemini-3.1-flash-lite-image").properties.aspect_ratio!.untested && geminiImageParams("gemini-nano-banana-2.1").properties.aspect_ratio!.untested === true)
check("gemini params: 30 voices", geminiSpeechParams().properties.voice!.enum!.length === 30)

const thoughtThenResult = {
  steps: [
    { type: "thought", content: [{ type: "image", data: "DRAFT", mime_type: "image/png" }] },
    { type: "model_output", content: [{ type: "text", text: "Here" }, { type: "image", data: "FINAL", mime_type: "image/jpeg" }] },
  ],
}
check("gemini image answer: the last model image, never a thought draft", JSON.stringify(geminiImages(thoughtThenResult)) === JSON.stringify(["data:image/jpeg;base64,FINAL"]))
check("gemini image answer: nothing found is empty", geminiImages({ steps: [] }).length === 0)

// Gemini speech
const tts = rec("gemini-3.8-flash-tts", geminiSpeechParams())
const speech = geminiSpeechBody(tts, "Good morning, team!", { voice: "Zephyr", style: "upbeat and brisk" })
check(
  "gemini speech: user_input turn with speech_metadata style and one voice",
  JSON.stringify(speech) ===
    JSON.stringify({
      model: "gemini-3.8-flash-tts",
      input: [{ type: "user_input", content: [{ type: "text", text: "Good morning, team!", annotations: [{ type: "speech_metadata", style: "upbeat and brisk" }] }] }],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: "Zephyr" }] },
    }),
)
check("gemini speech: no style leaves no annotation; default voice Kore", !("annotations" in ((geminiSpeechBody(tts, "Hi", {}).input as Array<{ content: Array<object> }>)[0]!.content[0]!)) && JSON.stringify((geminiSpeechBody(tts, "Hi", {}).generation_config as { speech_config: object }).speech_config) === JSON.stringify([{ voice: "Kore" }]))
check("gemini speech answer", geminiAudio({ steps: [{ type: "model_output", content: [{ type: "audio", data: "UklG" }] }] })?.data === "UklG" && geminiAudio({ steps: [] }) === undefined)

// OpenRouter images
const orRec = rec("black-forest-labs/flux.2-pro", { type: "object", properties: { aspect_ratio: { type: "string", enum: ["auto", "16:9"] }, resolution: { type: "string", untested: true }, n: { type: "integer", default: 1 }, seed: { type: "integer" } } })
const or = openrouterImageBody(orRec, "A fox", { aspect_ratio: "16:9", resolution: "2K", n: 2, seed: 7, max_tokens: 99 }, [png])
check("openrouter image: fields at the top level, references as input_references", or.model === "black-forest-labs/flux.2-pro" && or.aspect_ratio === "16:9" && or.resolution === "2K" && or.n === 2 && or.seed === 7 && JSON.stringify(or.input_references) === JSON.stringify([{ type: "image_url", image_url: { url: png } }]))
check("openrouter image: a chat setting is never sent", !("max_tokens" in or))
check("openrouter image: auto ratio is left out", !("aspect_ratio" in openrouterImageBody(orRec, "x", { aspect_ratio: "auto" })))
check("openrouter image answer", JSON.stringify(openrouterImages({ data: [{ b64_json: "QQ==", media_type: "image/webp" }, { url: "https://x/y.png" }] })) === JSON.stringify(["data:image/webp;base64,QQ==", "https://x/y.png"]))

// OpenAI
const oaImg = rec("gpt-image-2.5-sunburst", { type: "object", properties: { size: { type: "string" }, quality: { type: "string" }, n: { type: "integer" }, background: { type: "string" }, output_format: { type: "string" }, output_compression: { type: "integer" }, moderation: { type: "string" } } })
const f = openaiImageFields(oaImg, "A fox", { size: "1536x1024", quality: "xhigh", background: "transparent", output_format: "webp", output_compression: 80, moderation: "low", n: 3 })
check("openai image: every setting in its own field", f.size === "1536x1024" && f.quality === "xhigh" && f.background === "transparent" && f.output_format === "webp" && f.moderation === "low" && f.n === 3)
check("openai image: compression only for jpeg and webp", f.output_compression === 80 && !("output_compression" in openaiImageFields(oaImg, "x", { output_format: "png", output_compression: 80 })))
check("openai image: n is at least 1", openaiImageFields(oaImg, "x", { n: 0 }).n === 1)
const ttsClassic = rec("tts-1", { type: "object", properties: { voice: { type: "string" }, speed: { type: "number" }, instructions: { type: "string" }, response_format: { type: "string" } } })
const ttsMini = rec("gpt-4o-mini-tts", ttsClassic.params)
check("openai speech: tts-1 takes no instructions", !("instructions" in openaiSpeechBody(ttsClassic, "Hi", { voice: "alloy", instructions: "whisper" })))
check("openai speech: mini takes instructions, speed within 0.25 to 4, format", (() => { const b = openaiSpeechBody(ttsMini, "Hi", { voice: "ballad", instructions: "warm", speed: 9, response_format: "wav" }); return b.instructions === "warm" && b.speed === 4 && b.response_format === "wav" && b.voice === "ballad" })())
check("openai speech: input is cut at 4096 characters", String(openaiSpeechBody(ttsMini, "a".repeat(5000), {}).input).length === 4096)
check("data url split", JSON.stringify(splitDataUrl("data:audio/wav;base64,AB==")) === JSON.stringify({ mime: "audio/wav", data: "AB==" }) && splitDataUrl("https://x") === undefined)

// Gemini image prices from the token facts (Google's pricing page: $30 per 1M for Nano Banana 2.1)
const priced = (endpoint: string, amount: number, props: ModelRecord["params"]["properties"] = {}) =>
  ({ id: `gemini/${endpoint}`, endpoint, name: endpoint, provider: "gemini", modality: "image", params: { type: "object", properties: props }, price: { unit: "per_1m_tokens", amount, source: "scraped", fetchedAt: "" }, status: "active" }) as unknown as ModelRecord
const nb = priced("gemini-nano-banana-2.1", 30, geminiImageParams("gemini-nano-banana-2.1").properties)
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 0.0005
check("price: Nano Banana 2.1 1K is $0.0336", near(estimateRun(nb, { image_size: "1K" }).usd, 0.0336))
check("price: Nano Banana 2.1 2K is $0.0504 and 4K is $0.113", near(estimateRun(nb, { image_size: "2K" }).usd, 0.0504) && near(estimateRun(nb, { image_size: "4K" }).usd, 0.1134))
check("price: Pro 2K costs the same as 1K, 4K $0.24", near(estimateRun(priced("gemini-3-pro-image", 120), { image_size: "2K" }).usd, 0.1344) && near(estimateRun(priced("gemini-3-pro-image", 120), { image_size: "4K" }).usd, 0.24))
check("price: 3.1 Flash Image 512px is $0.045", near(estimateRun(priced("gemini-3.1-flash-image", 60), { image_size: "512px" }).usd, 0.0448))
check("price: a standard run is the smallest size", near(standardRun(nb).estimate.usd, 0.0336))

import { isRunnable, PROVIDER_IDS } from "../src/lib/registry/providers"
import { geminiVideoBody, geminiVideoUrl, openaiVideoBody, openrouterAudioBody, openrouterVideoBody } from "../src/lib/registry/direct-requests"

// Phase 3: All 5 providers support all 4 modalities
for (const p of PROVIDER_IDS) {
  for (const m of ["text", "image", "video", "audio"] as const) {
    check(`runnable: ${p} supports ${m}`, isRunnable(p, m))
  }
}

const veoRec = rec("veo-3.1-generate-preview", { type: "object", properties: { aspect_ratio: { type: "string" }, resolution: { type: "string" }, duration: { type: "integer" }, generate_audio: { type: "boolean" } } })
const veoBody = geminiVideoBody(veoRec, "Ocean waves", { aspect_ratio: "16:9", resolution: "1080p", duration: 8, generate_audio: true }, [png])
check("gemini video: Veo predictLongRunning body carries instances + parameters", JSON.stringify(veoBody.parameters) === JSON.stringify({ aspectRatio: "16:9", durationSeconds: 8, resolution: "1080p", generateAudio: true }))
check("gemini video answer: extracts generateVideoResponse URI", geminiVideoUrl({ response: { generateVideoResponse: { generatedSamples: [{ video: { uri: "https://example.com/veo.mp4" } }] } } }) === "https://example.com/veo.mp4")

const orVidRec = rec("bytedance/seedance-2.5", { type: "object", properties: { aspect_ratio: { type: "string" }, resolution: { type: "string" }, duration: { type: "integer" } } })
const orVidBody = openrouterVideoBody(orVidRec, "Cyberpunk street", { aspect_ratio: "16:9", resolution: "1080p", duration: 5 }, [png])
check("openrouter video: top-level fields and image_url reference", orVidBody.model === "bytedance/seedance-2.5" && orVidBody.resolution === "1080p" && orVidBody.image_url === png)

const orAudRec = rec("openai/gpt-4o-audio-preview", { type: "object", properties: { voice: { type: "string" } } })
const orAudBody = openrouterAudioBody(orAudRec, "Read this aloud", { voice: "nova" })
check("openrouter audio: modalities include audio and voice is passed", JSON.stringify(orAudBody.modalities) === JSON.stringify(["text", "audio"]) && (orAudBody.audio as { voice: string }).voice === "nova")

const soraRec = rec("sora-2", { type: "object", properties: { size: { type: "string" }, seconds: { type: "integer" }, quality: { type: "string" } } })
const soraBody = openaiVideoBody(soraRec, "Golden retriever in snow", { size: "1920x1080", seconds: 8, quality: "high" }, [png])
check("openai video: Sora body has model, size, seconds, quality, and input_reference", soraBody.model === "sora-2" && soraBody.size === "1920x1080" && soraBody.seconds === 8 && soraBody.input_reference === png)

console.log(fails ? `\n${fails} FAILED` : "\nall passed")
process.exit(fails ? 1 : 0)

