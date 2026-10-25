import { fetchBytes } from "./media-local"

/**
 * The sound of a stretch of a video, as a WAV file, so it can sit on an audio lane of its own and be moved, faded and mixed apart from
 * the picture. The file is read the way the app reads files (see media-local) and decoded in the page.
 */

function wav(channels: Float32Array[], sampleRate: number): Blob {
  const n = channels[0]?.length ?? 0
  const count = channels.length
  const bytes = new ArrayBuffer(44 + n * count * 2)
  const v = new DataView(bytes)
  const text = (at: number, s: string) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)))
  text(0, "RIFF")
  v.setUint32(4, 36 + n * count * 2, true)
  text(8, "WAVE")
  text(12, "fmt ")
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, count, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * count * 2, true)
  v.setUint16(32, count * 2, true)
  v.setUint16(34, 16, true)
  text(36, "data")
  v.setUint32(40, n * count * 2, true)
  let at = 44
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < count; c++) {
      const s = Math.max(-1, Math.min(1, channels[c]![i] ?? 0))
      v.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      at += 2
    }
  }
  return new Blob([bytes], { type: "audio/wav" })
}

/** The sound between `from` and `from + seconds` in a video file, or null when the video has no sound that can be read */
export async function extractSound(url: string, from: number, seconds: number): Promise<Blob | null> {
  try {
    const ctx = new OfflineAudioContext(1, 1, 44100)
    const buffer = await ctx.decodeAudioData(await fetchBytes(url))
    const start = Math.max(0, Math.min(buffer.length, Math.round(from * buffer.sampleRate)))
    const end = Math.max(start + 1, Math.min(buffer.length, Math.round((from + seconds) * buffer.sampleRate)))
    const channels = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, c) => buffer.getChannelData(c).slice(start, end))
    return channels.length > 0 ? wav(channels, buffer.sampleRate) : null
  } catch {
    return null
  }
}
