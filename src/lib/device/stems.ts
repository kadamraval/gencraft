import type { ModelRecord } from "@/lib/registry/types"
import type { StemsMessage, StemsRequest } from "./stems-worker"

/**
 * Stem splitting on this computer: free, no key, works with any provider (OpenRouter has no model that splits a song). The model
 * (HT-Demucs, ONNX, MIT licence, 166 MB) is downloaded the first time it is used and kept in the app's cache, so later runs work offline.
 */

export const DEVICE_PROVIDER = "device"
const MODEL_URL = "https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/main/htdemucs_fp16weights.onnx"
const MODEL_MB = 166
const CACHE = "gencraft-device-models-v1"
const ORT_VERSION = "1.30.0"
const WASM_PATHS = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`
const SAMPLE_RATE = 44100

/** The on-device splitter as a model record, so it is offered beside the providers' models by the same rule */
export const DEVICE_STEMS: ModelRecord = {
  id: `${DEVICE_PROVIDER}/htdemucs`,
  endpoint: "htdemucs",
  provider: DEVICE_PROVIDER,
  name: "Demucs (on this computer)",
  family: "Demucs",
  logoKey: "opensource",
  maker: "Open source",
  weights: "open",
  category: "audio",
  inputs: ["audio"],
  params: { type: "object", properties: { audio: { type: "string", title: "Audio", format: "audio", slot: { kind: "audio", role: "source", list: false, max: 1 } } }, required: ["audio"] },
  price: { unit: "per_run", amount: 0, source: "curated", fetchedAt: "2026-10-26" },
  status: "active",
  description: `Splits a song into vocals, drums, bass and the rest on this computer. Free. The model (${MODEL_MB} MB) downloads the first time.`,
  utility: true,
  serves: [{ id: "audio-stems", rank: 99, role: "model" }],
}

export type Progress = (line: string) => void

async function modelBytes(onLog: Progress, signal?: AbortSignal): Promise<ArrayBuffer> {
  const cache = typeof caches !== "undefined" ? await caches.open(CACHE) : undefined
  const hit = await cache?.match(MODEL_URL)
  if (hit) return hit.arrayBuffer()
  onLog(`Downloading the splitter model (${MODEL_MB} MB, once)`)
  const res = await fetch(MODEL_URL, { signal })
  if (!res.ok || !res.body) throw new Error(`The splitter model could not be downloaded (HTTP ${res.status}).`)
  const size = Number(res.headers.get("content-length")) || MODEL_MB * 1024 * 1024
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let got = 0
  let shown = -1
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    got += value.length
    const pct = Math.floor((got / size) * 100)
    if (pct !== shown && pct % 10 === 0) {
      shown = pct
      onLog(`Downloading the splitter model: ${pct}%`)
    }
  }
  const bytes = new Uint8Array(got)
  let at = 0
  for (const p of parts) {
    bytes.set(p, at)
    at += p.length
  }
  await cache?.put(MODEL_URL, new Response(bytes, { headers: { "content-type": "application/octet-stream" } }))
  return bytes.buffer
}

/** The song as two 44.1 kHz channels */
async function decode(url: string): Promise<[Float32Array, Float32Array]> {
  const data = await (await fetch(url)).arrayBuffer()
  const ctx = new AudioContext()
  const decoded = await ctx.decodeAudioData(data)
  await ctx.close()
  const length = Math.ceil(decoded.duration * SAMPLE_RATE)
  const off = new OfflineAudioContext(2, length, SAMPLE_RATE)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const out = await off.startRendering()
  return [out.getChannelData(0).slice(), out.getChannelData(out.numberOfChannels > 1 ? 1 : 0).slice()]
}

/** 16-bit stereo WAV */
function wav(left: Float32Array, right: Float32Array): Blob {
  const n = left.length
  const buf = new ArrayBuffer(44 + n * 4)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, "RIFF")
  v.setUint32(4, 36 + n * 4, true)
  str(8, "WAVE")
  str(12, "fmt ")
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 2, true)
  v.setUint32(24, SAMPLE_RATE, true)
  v.setUint32(28, SAMPLE_RATE * 4, true)
  v.setUint16(32, 4, true)
  v.setUint16(34, 16, true)
  str(36, "data")
  v.setUint32(40, n * 4, true)
  let o = 44
  const clip = (x: number) => Math.max(-1, Math.min(1, x))
  for (let i = 0; i < n; i++) {
    v.setInt16(o, clip(left[i]!) * 0x7fff, true)
    v.setInt16(o + 2, clip(right[i]!) * 0x7fff, true)
    o += 4
  }
  return new Blob([buf], { type: "audio/wav" })
}

/** Splits the song at `url`; returns one WAV address per stem: vocals, drums, bass, other */
export async function splitStemsOnDevice(url: string, onLog: Progress = () => undefined, signal?: AbortSignal): Promise<Array<{ name: string; url: string }>> {
  const model = await modelBytes(onLog, signal)
  onLog("Reading the song")
  const [left, right] = await decode(url)
  const worker = new Worker(new URL("./stems-worker.ts", import.meta.url), { type: "module" })
  try {
    const stems = await new Promise<Record<string, [Float32Array, Float32Array]>>((resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new Error("Stopped.")))
      worker.onmessage = (e: MessageEvent<StemsMessage>) => {
        const m = e.data
        if (m.kind === "progress") onLog(`Splitting: part ${m.done} of ${m.total}`)
        else if (m.kind === "done") resolve(m.stems)
        else reject(new Error(m.message))
      }
      worker.onerror = (e) => reject(new Error(e.message || "The splitter stopped."))
      const req: StemsRequest = { model, left, right, wasmPaths: WASM_PATHS }
      worker.postMessage(req, [model, left.buffer, right.buffer])
    })
    return ["vocals", "drums", "bass", "other"].map((name) => ({ name, url: URL.createObjectURL(wav(stems[name]![0], stems[name]![1])) }))
  } finally {
    worker.terminate()
  }
}
