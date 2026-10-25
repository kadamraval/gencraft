import { getProviderApiKey } from "@/lib/providers/live-connectors"
import { CHAT_ENDPOINT } from "@/lib/agent/model"
import { getRecord } from "@/lib/registry/store"
import { appFetch, providerFetch } from "@/lib/registry/net"
import type { GenerationMode, SettingsState } from "@/types"

/**
 * Talking to the app with a model you pick: your voice becomes text (speech to text), a spoken request can be
 * turned into a clean prompt, and replies can be spoken with a model's voice. With no model chosen, the
 * browser's own speech is used, as before.
 */

export const OPENAI_STT_MODELS = ["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"]
export const OPENAI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"]
export const SPEECH_LANGUAGES: Array<{ id: string; label: string }> = [
  { id: "device", label: "Device language" },
  { id: "en-US", label: "English (US)" },
  { id: "en-GB", label: "English (UK)" },
  { id: "hi-IN", label: "Hindi" },
  { id: "es-ES", label: "Spanish" },
  { id: "fr-FR", label: "French" },
  { id: "de-DE", label: "German" },
  { id: "pt-BR", label: "Portuguese (Brazil)" },
  { id: "it-IT", label: "Italian" },
  { id: "ja-JP", label: "Japanese" },
  { id: "ko-KR", label: "Korean" },
  { id: "zh-CN", label: "Chinese" },
  { id: "ar-SA", label: "Arabic" },
]

/** The speech-to-text model to use, when one is chosen and its provider has a key. */
export function sttModel(settings: SettingsState): { provider: "openai" | "gemini"; model: string; key: string } | null {
  const cfg = settings.aiEngine.speechToText
  if (!cfg) return null
  const key = getProviderApiKey(cfg.provider, settings)
  return key ? { ...cfg, key } : null
}

export function ttsModel(settings: SettingsState): { provider: "openai"; model: string; voice: string; key: string } | null {
  const cfg = settings.aiEngine.textToSpeech
  if (!cfg) return null
  const key = getProviderApiKey(cfg.provider, settings)
  return key ? { ...cfg, key } : null
}

const base64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ""
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

const plainError = async (res: Response) => {
  const text = await res.text().catch(() => "")
  try {
    const msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message
    if (msg) return msg
  } catch {
    // not JSON: the raw text is used
  }
  return text.slice(0, 200) || `HTTP ${res.status}`
}

/** Turns a recording into text with the chosen model. Throws a plain message when it cannot. */
export async function transcribe(blob: Blob, settings: SettingsState): Promise<string> {
  const stt = sttModel(settings)
  if (!stt) throw new Error("No speech model is set. Choose one in Settings, General, Voice.")
  const language = settings.aiEngine.speechLanguage?.split("-")[0]
  if (stt.provider === "openai") {
    const form = new FormData()
    form.append("file", blob, `speech.${blob.type.includes("mp4") ? "m4a" : "webm"}`)
    form.append("model", stt.model)
    if (language) form.append("language", language)
    const res = await providerFetch("openai", "/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${stt.key.trim()}` }, body: form })
    if (!res.ok) throw new Error(`OpenAI could not read the recording: ${await plainError(res)}`)
    return ((await res.json()) as { text?: string }).text?.trim() ?? ""
  }
  const res = await providerFetch("gemini", `/v1beta/models/${stt.model}:generateContent?key=${encodeURIComponent(stt.key.trim())}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Write down exactly what is said in this audio, in the language spoken. Reply with the words only." }, { inline_data: { mime_type: blob.type || "audio/webm", data: await base64(blob) } }] }],
    }),
  })
  if (!res.ok) throw new Error(`Gemini could not read the recording: ${await plainError(res)}`)
  const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  return body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? ""
}

/** The reply as sound from the chosen voice model, or null when none is chosen. */
export async function speechAudio(text: string, settings: SettingsState): Promise<Blob | null> {
  const tts = ttsModel(settings)
  if (!tts) return null
  const res = await providerFetch("openai", "/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${tts.key.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: tts.model, voice: tts.voice, input: text.slice(0, 3800), response_format: "mp3" }),
  })
  if (!res.ok) throw new Error(`OpenAI could not speak the reply: ${await plainError(res)}`)
  return res.blob()
}

const MODE_WORDS: Record<string, string> = {
  image: "an image generation model",
  video: "a video generation model",
  audio: "an audio generation model",
}

/**
 * Turns what was said into a clean prompt for the current kind of work, with the chat model the person chose.
 * When nothing can polish it, the spoken words are returned unchanged.
 */
export async function polishSpoken(spoken: string, mode: GenerationMode, settings: SettingsState): Promise<string> {
  const record = getRecord(settings.aiEngine.activeTextModelId ?? "")
  const target = MODE_WORDS[mode]
  if (!record || !target) return spoken
  const endpoint = CHAT_ENDPOINT[record.provider]
  const key = getProviderApiKey(record.provider as "openai" | "gemini" | "openrouter", settings)
  if (!endpoint || !key) return spoken
  try {
    const res = await appFetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${key.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: record.endpoint,
        messages: [
          { role: "system", content: `Rewrite a spoken request as one clear prompt for ${target}. Keep every detail the person said, fix the wording, add nothing they did not mean. Reply with the prompt only.` },
          { role: "user", content: spoken },
        ],
      }),
    })
    if (!res.ok) return spoken
    const out = ((await res.json()) as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content?.trim()
    return out || spoken
  } catch {
    return spoken
  }
}
