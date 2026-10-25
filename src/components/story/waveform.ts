import * as React from "react"
import { fetchBytes } from "./media-local"

/**
 * What a sound looks like and where it is quiet or hits. The file is read once and decoded in the page; the result is kept for the
 * session. Used for the waveform on the timeline and by the agent to find silence and beats.
 */

const cache = new Map<string, Promise<Float32Array | null>>()

async function decode(url: string): Promise<AudioBuffer | null> {
  try {
    const bytes = await fetchBytes(url)
    const ctx = new AudioContext()
    try {
      return await ctx.decodeAudioData(bytes)
    } finally {
      void ctx.close()
    }
  } catch {
    return null
  }
}

const buffers = new Map<string, Promise<AudioBuffer | null>>()
const bufferOf = (url: string) => {
  let b = buffers.get(url)
  if (!b) {
    b = decode(url)
    buffers.set(url, b)
  }
  return b
}

/** The loudness of a sound in `bins` steps along its length, 0 to 1 */
export function peaksFor(url: string, bins = 240): Promise<Float32Array | null> {
  const key = `${url}:${bins}`
  let p = cache.get(key)
  if (!p) {
    p = bufferOf(url).then((buf) => {
      if (!buf) return null
      const data = buf.getChannelData(0)
      const size = Math.max(1, Math.floor(data.length / bins))
      const out = new Float32Array(bins)
      for (let i = 0; i < bins; i++) {
        let max = 0
        for (let j = i * size; j < Math.min(data.length, (i + 1) * size); j += 8) max = Math.max(max, Math.abs(data[j] ?? 0))
        out[i] = Math.min(1, max)
      }
      return out
    })
    cache.set(key, p)
  }
  return p
}

export function useWaveform(url: string | undefined, bins = 240): Float32Array | null {
  const [peaks, setPeaks] = React.useState<Float32Array | null>(null)
  React.useEffect(() => {
    let live = true
    setPeaks(null)
    if (url) void peaksFor(url, bins).then((p) => live && setPeaks(p))
    return () => {
      live = false
    }
  }, [url, bins])
  return peaks
}

/** Stretches of a sound where it stays quieter than `threshold` (0 to 1) for at least `minSeconds`, as [start, end] in seconds */
export async function findSilence(url: string, threshold = 0.04, minSeconds = 0.6): Promise<{ seconds: number; silences: Array<[number, number]> } | null> {
  const buf = await bufferOf(url)
  if (!buf) return null
  const bins = Math.max(10, Math.round(buf.duration * 20))
  const peaks = await peaksFor(url, bins)
  if (!peaks) return null
  const step = buf.duration / bins
  const out: Array<[number, number]> = []
  let from = -1
  for (let i = 0; i <= bins; i++) {
    const quiet = i < bins && peaks[i]! < threshold
    if (quiet && from < 0) from = i
    if (!quiet && from >= 0) {
      if ((i - from) * step >= minSeconds) out.push([Math.round(from * step * 100) / 100, Math.round(i * step * 100) / 100])
      from = -1
    }
  }
  return { seconds: Math.round(buf.duration * 100) / 100, silences: out }
}

/** The times of the strong beats in a sound, found where the energy jumps. A first estimate, good for music with a clear pulse. */
export async function findBeats(url: string): Promise<{ seconds: number; beats: number[] } | null> {
  const buf = await bufferOf(url)
  if (!buf) return null
  const data = buf.getChannelData(0)
  const win = Math.round(buf.sampleRate * 0.02)
  const energy: number[] = []
  for (let i = 0; i + win < data.length; i += win) {
    let sum = 0
    for (let j = i; j < i + win; j += 4) sum += (data[j] ?? 0) ** 2
    energy.push(sum)
  }
  const flux = energy.map((e, i) => Math.max(0, e - (energy[i - 1] ?? 0)))
  const mean = flux.reduce((a, b) => a + b, 0) / Math.max(1, flux.length)
  const spread = Math.sqrt(flux.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, flux.length))
  const limit = mean + spread * 1.5
  const beats: number[] = []
  let last = -1
  flux.forEach((f, i) => {
    const t = (i * win) / buf.sampleRate
    if (f > limit && t - last >= 0.25) {
      beats.push(Math.round(t * 100) / 100)
      last = t
    }
  })
  return { seconds: Math.round(buf.duration * 100) / 100, beats }
}
