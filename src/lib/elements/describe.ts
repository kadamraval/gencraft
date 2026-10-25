import type { ModelRecord } from "../registry/types"
import type { ElementCategory } from "./types"

/**
 * Turns an example image or clip into the words a style element adds to a prompt.
 * A vision-capable chat model from the user's own key does the looking; the instruction is specific to the
 * category so a "light" element describes only the light.
 */

const INSTRUCTION: Record<ElementCategory, string> = {
  character:
    "Describe only the person or character in these images so a model that cannot see the pictures can draw the same one: age, build, face, hair, skin, clothing and anything worn or carried. Do not describe the background.",
  location:
    "Describe only the place in these images so a model that cannot see the pictures can draw the same one: kind of place, layout, materials, colors, time of day and notable features. Do not describe people.",
  product:
    "Describe only the product in these images so a model that cannot see the pictures can draw the same one: kind of object, shape, materials, colors, finish, text and logos on it. Do not describe the background.",
  prop:
    "Describe only the object in these images so a model that cannot see the pictures can draw the same one: kind of object, shape, materials, colors and wear. Do not describe the background.",
  camera:
    "Describe only the camera work in these frames: shot size, angle, lens feel, framing and any movement. Do not describe the subject or the setting.",
  light:
    "Describe only the lighting in these frames: direction, quality (hard or soft), color temperature, contrast and mood. Do not describe the subject or the setting.",
  style:
    "Describe only the visual style in these frames: medium, rendering, color palette, texture and finish. Do not describe what is depicted.",
  effects:
    "Describe only the visual effects in these frames: particles, atmosphere, motion effects, post-processing. Do not describe the subject or the setting.",
}

const RULES =
  " Answer with one phrase of at most 30 words, written as a comma-separated list a video or image model can use in a prompt. No preamble, no names of real people, no quotation marks."

export interface DescribeRequest {
  category: ElementCategory
  /** Data URLs, one per frame or image */
  images: string[]
  record: ModelRecord
  apiKey: string
  signal?: AbortSignal
}

const clean = (text: string): string =>
  text
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 400)

function splitDataUrl(url: string): { mime: string; data: string } {
  const m = url.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) throw new Error("The example could not be read")
  return { mime: m[1]!, data: m[2]! }
}

async function fail(provider: string, res: Response): Promise<never> {
  const body = await res.text().catch(() => "")
  throw new Error(`${provider} could not describe the example (HTTP ${res.status}): ${body.slice(0, 160)}`)
}

export async function describeExample(req: DescribeRequest): Promise<string> {
  const { record, apiKey, images, signal } = req
  const text = INSTRUCTION[req.category] + RULES
  const key = apiKey.trim()

  if (record.provider === "gemini") {
    const parts = [{ text }, ...images.map((u) => ({ inline_data: { mime_type: splitDataUrl(u).mime, data: splitDataUrl(u).data } }))]
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${record.endpoint}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
      signal,
    })
    if (!res.ok) await fail("Gemini", res)
    const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    return clean((json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join(""))
  }

  if (record.provider === "openai" || record.provider === "openrouter") {
    const url = record.provider === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions"
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Gencraft" },
      body: JSON.stringify({
        model: record.endpoint,
        messages: [{ role: "user", content: [{ type: "text", text }, ...images.map((u) => ({ type: "image_url", image_url: { url: u } }))] }],
      }),
      signal,
    })
    if (!res.ok) await fail(record.provider === "openai" ? "OpenAI" : "OpenRouter", res)
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    return clean(json.choices?.[0]?.message?.content ?? "")
  }

  throw new Error(`${record.provider} cannot describe images from here`)
}

/** Text models that accept images and that the user has a key for, cheapest input price first. */
export function describerCandidates(models: ModelRecord[], hasKey: (provider: string) => boolean): ModelRecord[] {
  return models
    .filter((m) => m.modality === "text" && m.inputs.includes("image") && ["openai", "gemini", "openrouter"].includes(m.provider) && hasKey(m.provider))
    .sort((a, b) => {
      const x = a.price.amount
      const y = b.price.amount
      // Free and unpriced models are often previews; priced ones are the dependable default
      if (!x && !y) return a.name.localeCompare(b.name)
      if (!x) return 1
      if (!y) return -1
      return x - y
    })
}

/** A still image as a data URL, scaled down so the request stays small. */
export function fileToDataUrl(file: Blob, maxEdge = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL("image/jpeg", 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("That image could not be opened"))
    }
    img.src = url
  })
}

/** Three frames from a clip (quarter, half, three quarters of the way), for models that take images only. */
export function videoFrames(file: Blob, maxEdge = 768): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement("video")
    video.muted = true
    video.preload = "auto"
    video.src = url
    const frames: string[] = []
    const stops = [0.25, 0.5, 0.75]
    const done = (err?: Error) => {
      URL.revokeObjectURL(url)
      if (err) reject(err)
      else resolve(frames)
    }
    video.onerror = () => done(new Error("That clip could not be opened"))
    video.onloadedmetadata = () => {
      video.currentTime = video.duration * stops[0]!
    }
    video.onseeked = () => {
      const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight))
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height)
      frames.push(canvas.toDataURL("image/jpeg", 0.8))
      if (frames.length >= stops.length) done()
      else video.currentTime = video.duration * stops[frames.length]!
    }
  })
}
