import { localize } from "./media-local"

/**
 * How bright and how colourful a picture or a moment of a video is, from a small copy of it. Used to even out the look of clips.
 * The file is read the way the app reads files (see media-local), so a picture from another site can be measured too.
 */

export interface FrameStats {
  /** Average brightness, 0 to 255 */
  luma: number
  /** Average colourfulness, 0 to 1 */
  saturation: number
}

const loadImage = (url: string) =>
  new Promise<HTMLImageElement | null>((done) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => done(img)
    img.onerror = () => done(null)
    img.src = url
  })

const loadFrame = (url: string, at: number) =>
  new Promise<HTMLVideoElement | null>((done) => {
    const v = document.createElement("video")
    v.crossOrigin = "anonymous"
    v.muted = true
    v.preload = "auto"
    v.onerror = () => done(null)
    v.onloadeddata = () => {
      v.onseeked = () => done(v)
      v.currentTime = Math.min(Math.max(0, at), Math.max(0, (v.duration || at) - 0.05))
    }
    v.src = url
    window.setTimeout(() => done(null), 8000)
  })

export async function frameStats(url: string, kind: "video" | "image", at = 0.5): Promise<FrameStats | null> {
  const local = await localize([url])
  try {
    const address = local.use(url)!
    const source = kind === "image" ? await loadImage(address) : await loadFrame(address, at)
    if (!source) return null
    const c = document.createElement("canvas")
    c.width = 48
    c.height = 27
    const g = c.getContext("2d", { willReadFrequently: true })
    if (!g) return null
    g.drawImage(source, 0, 0, c.width, c.height)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let luma = 0
    let sat = 0
    const n = d.length / 4
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]!
      const gr = d[i + 1]!
      const b = d[i + 2]!
      luma += 0.2126 * r + 0.7152 * gr + 0.0722 * b
      const max = Math.max(r, gr, b)
      sat += max === 0 ? 0 : (max - Math.min(r, gr, b)) / max
    }
    return { luma: luma / n, saturation: sat / n }
  } catch {
    return null
  } finally {
    local.release()
  }
}

const seekTo = (v: HTMLVideoElement, t: number) =>
  new Promise<void>((done) => {
    let finished = false
    const end = () => {
      if (finished) return
      finished = true
      v.removeEventListener("seeked", end)
      done()
    }
    v.addEventListener("seeked", end)
    v.currentTime = t
    window.setTimeout(end, 3000)
  })

/**
 * Where a video cuts from one shot to another: the moments where the picture changes a lot from one sample to the next. Times are seconds
 * in the footage. A first estimate, good for hard cuts; a slow dissolve may be missed.
 */
export async function sceneChanges(url: string, from: number, to: number, step = 0.4): Promise<number[] | null> {
  const local = await localize([url])
  try {
    const v = document.createElement("video")
    v.crossOrigin = "anonymous"
    v.muted = true
    v.preload = "auto"
    const ready = await new Promise<boolean>((done) => {
      v.onloadeddata = () => done(true)
      v.onerror = () => done(false)
      window.setTimeout(() => done(false), 8000)
      v.src = local.use(url)!
    })
    if (!ready) return null
    const c = document.createElement("canvas")
    c.width = 32
    c.height = 18
    const g = c.getContext("2d", { willReadFrequently: true })
    if (!g) return null
    const end = Math.min(to, Number.isFinite(v.duration) ? v.duration - 0.05 : to)
    const cuts: number[] = []
    let last: Uint8ClampedArray | null = null
    for (let t = Math.max(0, from); t <= end; t += step) {
      await seekTo(v, t)
      g.drawImage(v, 0, 0, c.width, c.height)
      const d = g.getImageData(0, 0, c.width, c.height).data
      if (last) {
        let sum = 0
        for (let i = 0; i < d.length; i += 4) sum += Math.abs(d[i]! - last[i]!) + Math.abs(d[i + 1]! - last[i + 1]!) + Math.abs(d[i + 2]! - last[i + 2]!)
        const diff = sum / (d.length / 4) / 3
        if (diff > 24 && (cuts.length === 0 || t - cuts[cuts.length - 1]! > 1)) {
          // Narrow the cut down between the two samples by halving, so it lands within a few hundredths of a second
          let lo = t - step
          let hi = t
          for (let k = 0; k < 4; k++) {
            const mid = (lo + hi) / 2
            await seekTo(v, mid)
            g.drawImage(v, 0, 0, c.width, c.height)
            const m = g.getImageData(0, 0, c.width, c.height).data
            let ms = 0
            for (let i = 0; i < m.length; i += 4) ms += Math.abs(m[i]! - last[i]!) + Math.abs(m[i + 1]! - last[i + 1]!) + Math.abs(m[i + 2]! - last[i + 2]!)
            if (ms / (m.length / 4) / 3 > 24) hi = mid
            else lo = mid
          }
          cuts.push(Math.round(hi * 100) / 100)
          // The picture on screen is now one of the halved samples; read the sample at t again so the next comparison starts from it
          await seekTo(v, t)
          g.drawImage(v, 0, 0, c.width, c.height)
          last = new Uint8ClampedArray(g.getImageData(0, 0, c.width, c.height).data)
          continue
        }
      }
      last = new Uint8ClampedArray(d)
    }
    return cuts
  } catch {
    return null
  } finally {
    local.release()
  }
}
