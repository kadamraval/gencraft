import * as React from "react"

/**
 * The frames shown inside a video clip on the timeline. Twenty small pictures are taken from across the whole
 * video once, kept for the session, and each clip shows the ones that fall inside its trimmed part. Videos are
 * read one at a time so the page stays light.
 */

export interface Strip {
  frames: string[]
  /** Seconds in the whole source video */
  duration: number
}

const FRAMES = 20
const done = new Map<string, Strip | "failed">()
const waiting = new Map<string, Promise<void>>()
let queue: Promise<void> = Promise.resolve()

/** Waits for an event, or gives up so a broken file cannot hold the queue */
const once = (el: HTMLVideoElement, event: string, ms = 6000) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`no ${event}`)), ms)
    el.addEventListener(
      event,
      () => {
        window.clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
    el.addEventListener("error", () => reject(new Error("video error")), { once: true })
  })

async function extract(url: string): Promise<Strip> {
  const v = document.createElement("video")
  v.crossOrigin = "anonymous"
  v.muted = true
  v.preload = "auto"
  v.src = url
  await once(v, "loadedmetadata")
  const duration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1
  const canvas = document.createElement("canvas")
  canvas.width = 160
  canvas.height = 90
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no canvas")
  const frames: string[] = []
  for (let i = 0; i < FRAMES; i++) {
    v.currentTime = ((i + 0.5) / FRAMES) * duration
    await once(v, "seeked")
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    frames.push(canvas.toDataURL("image/jpeg", 0.6))
  }
  v.removeAttribute("src")
  v.load()
  return { frames, duration }
}

function load(url: string): Promise<void> {
  const known = waiting.get(url)
  if (known) return known
  const job = queue.then(async () => {
    try {
      done.set(url, await extract(url))
    } catch {
      done.set(url, "failed")
    }
  })
  queue = job
  waiting.set(url, job)
  return job
}

/** The frames of a video, or null while they are being taken (and for a file that cannot be read) */
export function useStrip(url: string | undefined, isVideo: boolean): Strip | null {
  const [, refresh] = React.useState(0)
  React.useEffect(() => {
    if (!url || !isVideo || done.has(url)) return
    let alive = true
    void load(url).then(() => alive && refresh((n) => n + 1))
    return () => {
      alive = false
    }
  }, [url, isVideo])
  const got = url ? done.get(url) : undefined
  return got && got !== "failed" ? got : null
}

/** Which of the strip's frames shows at a moment of the source video */
export function frameAt(strip: Strip, seconds: number): string | undefined {
  const i = Math.min(strip.frames.length - 1, Math.max(0, Math.floor((seconds / strip.duration) * strip.frames.length)))
  return strip.frames[i]
}
