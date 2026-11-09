/// <reference lib="webworker" />
import * as ort from "onnxruntime-web"

/**
 * Splits a song into drums, bass, other and vocals on this computer with HT-Demucs (ONNX, MIT licence). The song comes in as two 44.1 kHz
 * channels; it is cut into 7.8 s pieces that overlap by a quarter and are faded together, exactly as the model's reference code does
 * (StemSplitio/htdemucs-onnx, infer.py). Runs in a worker so the app never freezes.
 */

const SAMPLE_RATE = 44100
const N_SAMPLES = Math.floor(7.8 * SAMPLE_RATE)
const SOURCES = ["drums", "bass", "other", "vocals"] as const

export interface StemsRequest {
  model: ArrayBuffer
  left: Float32Array
  right: Float32Array
  wasmPaths: string
}

export type StemsMessage = { kind: "progress"; done: number; total: number } | { kind: "done"; stems: Record<string, [Float32Array, Float32Array]> } | { kind: "error"; message: string }

function windowOf(n: number, overlap: number): Float32Array {
  const w = new Float32Array(n).fill(1)
  for (let i = 0; i < overlap; i++) {
    const v = i / Math.max(1, overlap - 1)
    w[i] = v
    w[n - 1 - i] = v
  }
  return w
}

self.onmessage = async (e: MessageEvent<StemsRequest>) => {
  const post = (m: StemsMessage, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer)
  try {
    const { model, left, right, wasmPaths } = e.data
    ort.env.wasm.wasmPaths = wasmPaths
    const session = await ort.InferenceSession.create(model, { executionProviders: ["webgpu", "wasm"], graphOptimizationLevel: "all" })
    const total = left.length
    const overlap = Math.floor(N_SAMPLES / 4)
    const stride = N_SAMPLES - overlap
    const chunks = Math.max(1, Math.ceil(total / stride))
    const win = windowOf(N_SAMPLES, overlap)
    const out = SOURCES.map(() => [new Float32Array(total), new Float32Array(total)] as [Float32Array, Float32Array])
    const weight = new Float32Array(total)
    const input = new Float32Array(2 * N_SAMPLES)
    for (let c = 0; c < chunks; c++) {
      const start = c * stride
      const end = Math.min(start + N_SAMPLES, total)
      const len = end - start
      input.fill(0)
      input.set(left.subarray(start, end), 0)
      input.set(right.subarray(start, end), N_SAMPLES)
      const result = await session.run({ mix: new ort.Tensor("float32", input, [1, 2, N_SAMPLES]) })
      const stems = result.stems!.data as Float32Array // (1, 4, 2, N)
      for (let s = 0; s < SOURCES.length; s++) {
        for (let ch = 0; ch < 2; ch++) {
          const base = (s * 2 + ch) * N_SAMPLES
          const target = out[s]![ch]!
          for (let i = 0; i < len; i++) target[start + i]! += stems[base + i]! * win[i]!
        }
      }
      for (let i = 0; i < len; i++) weight[start + i]! += win[i]!
      post({ kind: "progress", done: c + 1, total: chunks })
    }
    for (const [l, r] of out) {
      for (let i = 0; i < total; i++) {
        const w = Math.max(weight[i]!, 1e-8)
        l[i]! /= w
        r[i]! /= w
      }
    }
    const stems: Record<string, [Float32Array, Float32Array]> = {}
    SOURCES.forEach((name, i) => (stems[name] = out[i]!))
    post({ kind: "done", stems }, out.flatMap(([l, r]) => [l.buffer, r.buffer]))
  } catch (err) {
    post({ kind: "error", message: err instanceof Error ? err.message : String(err) })
  }
}
