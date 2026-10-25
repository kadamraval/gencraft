import { captionLook, drawWithFx, fadeFactor } from "./clip-fx"
import { Compositor } from "./compositor/compositor"
import { composeAt, fallbackFx, overlapGain, type DrawItem } from "./compositor/frame"
import { loadProjectFonts } from "./project-fonts"
import { drawTexts } from "./text-render"
import { soundGain, clipStarts, exportSize, overlaysOf, speedOf, totalLength, isOff, trackOf, type ClipFx, type ClipSrc, type EditProject } from "./edit-model"

/**
 * Turns the cut into one video file, on this page. The main track and every layer above it are drawn one frame at
 * a time onto a canvas while it plays in real time, with each clip's motion, opacity, crop, colour and fades; the
 * captions are drawn over them, and the audio is mixed in. The browser's recorder writes the result. Nothing is
 * uploaded. Layers that are muted are left out, and the picture has the shape the cut was given.
 */

export interface ClipSource {
  url: string | undefined
  kind: "video" | "image" | "empty"
}

export interface ExportOptions {
  /** The short side in pixels: 480, 720 or 1080 */
  res?: number
  fps?: number
  /** Seconds to export from and to; the whole cut by default */
  from?: number
  to?: number
}

export interface ExportInput {
  project: EditProject
  resolve: (item: { shotId: string; take: number; src?: ClipSrc }) => ClipSource
  audioUrl: (uploadId: string) => string | undefined
  onProgress: (share: number) => void
  options?: ExportOptions
  /** Called to stop an export that is running */
  signal?: AbortSignal
}

/** One thing to draw: a clip of the main track or an overlay, with the video element that plays it */
export interface Piece {
  id: string
  start: number
  duration: number
  trimIn: number
  fx: ClipFx | undefined
  layer: number
  /** The transition from the clip before, for main-track clips */
  transitionIn?: { id: string; duration: number }
  source: ClipSource
  video?: HTMLVideoElement
  gain?: GainNode
  started: boolean
}

/** The clips of the main track and the overlays as things to draw, the lowest layer first */
export function buildPieces(p: EditProject, resolve: ExportInput["resolve"]): Piece[] {
  const starts = clipStarts(p.clips)
  return [
    ...p.clips.map((c, i) => ({ id: c.id, start: starts[i]!, duration: c.duration, trimIn: c.trimIn, fx: c.fx, layer: 1, transitionIn: c.transitionIn, source: resolve(c), started: false })),
    ...overlaysOf(p).map((o) => ({ id: o.id, start: o.start, duration: o.duration, trimIn: o.trimIn, fx: o.fx, layer: o.layer, source: resolve(o), started: false })),
  ].sort((a, b) => a.layer - b.layer)
}

/** Loads the pictures of the pieces, by address */
export async function loadPictures(pieces: Piece[]): Promise<Map<string, HTMLImageElement>> {
  const pictures = new Map<string, HTMLImageElement>()
  await Promise.all(
    pieces
      .filter((r) => r.source.kind === "image" && r.source.url)
      .map(
        (r) =>
          new Promise<void>((done) => {
            const url = r.source.url!
            if (pictures.has(url)) return done()
            const img = new Image()
            img.crossOrigin = "anonymous"
            img.onload = () => {
              pictures.set(url, img)
              done()
            }
            img.onerror = () => done()
            img.src = url
          }),
      ),
  )
  return pictures
}

/** Draws the captions that show at a time, with their size, place and animation */
export function drawCaptions(ctx: CanvasRenderingContext2D, p: EditProject, t: number, W: number, H: number) {
  if (trackOf(p, "captions").mute) return
  const k = Math.min(W, H) / 720
  const wrap = (text: string, maxWidth: number) => {
    const lines: string[] = []
    for (const para of text.split("\n")) {
      let line = ""
      for (const word of para.split(" ")) {
        const test = line ? `${line} ${word}` : word
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line)
          line = word
        } else line = test
      }
      lines.push(line)
    }
    return lines
  }
  for (const cap of p.captions) {
    if (cap.rich || t < cap.start || t >= cap.start + cap.duration) continue
    const look = captionLook(cap.style, t - cap.start, cap.duration)
    ctx.save()
    ctx.globalAlpha = look.alpha
    ctx.font = `${look.italic ? "italic " : ""}bold ${Math.round(look.size * k)}px ${look.font}`
    ctx.textAlign = "center"
    ctx.lineJoin = "round"
    // Letter spacing is a canvas setting only in newer browsers; where it is missing the letters stay as they are
    if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(look.spacing * look.size * k).toFixed(2)}px`
    const text = look.upper ? cap.text.toUpperCase() : cap.text
    const full = wrap(text, W - 200 * k)
    // Typewriter shows the first letters only
    let left = Math.ceil(text.replace(/\s/g, "").length * look.typed)
    const lines = look.typed >= 1 ? full : full.map((line) => {
      const take = Math.min(left, line.replace(/\s/g, "").length)
      left -= take
      let seen = 0
      return [...line].filter((ch) => (/\s/.test(ch) ? seen < take : ++seen <= take)).join("")
    })
    const step = look.size * k * 1.2
    const base = H * look.y - look.rise * k
    const mid = base - (look.position === "top" ? 0 : look.position === "middle" ? ((lines.length - 1) * step) / 2 : (lines.length - 1) * step)
    if (look.scale !== 1) {
      ctx.translate(W / 2, mid)
      ctx.scale(look.scale, look.scale)
      ctx.translate(-W / 2, -mid)
    }
    if (look.box && look.boxFill) {
      const widest = Math.max(...full.map((l) => ctx.measureText(l).width))
      ctx.fillStyle = look.boxFill
      const pad = 16 * k
      ctx.beginPath()
      ctx.roundRect(W / 2 - widest / 2 - pad, mid - look.size * k, widest + pad * 2, (full.length - 1) * step + look.size * k * 1.5, 9 * k)
      ctx.fill()
    }
    lines.forEach((line, n) => {
      const y = mid + n * step
      ctx.shadowColor = "transparent"
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
      if (look.mode === "outline") {
        ctx.lineWidth = 8 * k
        ctx.strokeStyle = look.edge
        ctx.strokeText(line, W / 2, y)
      } else if (look.mode === "stroke") {
        ctx.lineWidth = 15 * k
        ctx.strokeStyle = look.edge
        ctx.strokeText(line, W / 2, y)
      } else if (look.mode === "shadow") {
        ctx.shadowColor = "rgba(0,0,0,0.8)" // allow-color
        ctx.shadowBlur = 8 * k
        ctx.shadowOffsetY = 3 * k
      } else if (look.mode === "glow" || look.mode === "neon") {
        // Two passes of light, wide and tight, then the letters on top
        ctx.shadowColor = look.glow
        ctx.shadowBlur = (look.mode === "neon" ? 34 : 26) * k
        ctx.fillStyle = look.fill
        ctx.fillText(line, W / 2, y)
        ctx.shadowBlur = 10 * k
      }
      ctx.fillStyle = look.fill
      ctx.fillText(line, W / 2, y)
    })
    ctx.restore()
  }
}

export async function renderCut({ project: p, resolve, audioUrl, onProgress, options = {}, signal }: ExportInput): Promise<{ blob: Blob; ext: "mp4" | "webm"; seconds: number }> {
  if (p.clips.length === 0 && overlaysOf(p).length === 0) throw new Error("There is nothing on the timeline to export.")
  if (typeof MediaRecorder === "undefined") throw new Error("This window cannot record video, so the cut cannot be exported here.")
  const { W, H } = exportSize(p, options.res ?? 720)
  const fps = options.fps ?? 30
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("This window cannot draw the video.")
  const whole = totalLength(p)
  const from = Math.max(0, Math.min(options.from ?? 0, whole))
  const to = Math.max(from + 0.2, Math.min(options.to ?? whole, whole))
  const length = to - from

  const pieces = buildPieces(p, resolve)
  await loadProjectFonts(p)
  let gpu: Compositor | null = null
  try {
    gpu = Compositor.supported() ? new Compositor(W, H) : null
  } catch {
    gpu = null
  }

  // Pictures are loaded first; each video plays from its own hidden element
  const pictures = await loadPictures(pieces)

  const actx = new AudioContext()
  const sink = actx.createMediaStreamDestination()
  for (const piece of pieces) {
    if (piece.source.kind !== "video" || !piece.source.url) continue
    const video = document.createElement("video")
    video.crossOrigin = "anonymous"
    video.playsInline = true
    video.src = piece.source.url
    try {
      const gain = actx.createGain()
      gain.gain.value = piece.fx?.volume ?? 1
      actx.createMediaElementSource(video).connect(gain).connect(sink)
      piece.gain = gain
    } catch {
      // the browser would not route this video's sound
    }
    piece.video = video
  }
  const sounds = p.audio
    .filter((a) => !isOff(p, `a${a.lane ?? 1}`))
    .map((a) => ({ a, url: audioUrl(a.uploadId) }))
    .filter((s): s is { a: (typeof p.audio)[number]; url: string } => Boolean(s.url))
    .map(({ a, url }) => {
      const el = new Audio(url)
      el.crossOrigin = "anonymous"
      const gain = actx.createGain()
      gain.gain.value = a.volume
      actx.createMediaElementSource(el).connect(gain).connect(sink)
      return { a, el, gain }
    })

  const stream = canvas.captureStream(fps)
  sink.stream.getAudioTracks().forEach((t) => stream.addTrack(t))
  const type = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? ""
  const recorder = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: Math.round(6_000_000 * ((W * H) / (1280 * 720))) } : undefined)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
  const finished = new Promise<void>((resolveStop) => (recorder.onstop = () => resolveStop()))

  recorder.start(250)
  void actx.resume()
  const t0 = performance.now()
  await new Promise<void>((resolveRun) => {
    const frame = () => {
      const elapsed = (performance.now() - t0) / 1000
      const t = from + elapsed
      if (elapsed >= length || signal?.aborted) return resolveRun()
      onProgress(Math.min(0.99, elapsed / length))
      ctx.fillStyle = "#000" // allow-color
      ctx.fillRect(0, 0, W, H)
      const items: DrawItem[] = []
      // The main track and then each layer above it, the lowest first
      for (const piece of pieces) {
        const hidden = isOff(p, `v${piece.layer}`)
        const live = t >= piece.start && t < piece.start + piece.duration
        const into = t - piece.start
        if (!live || hidden) {
          if (piece.video && !piece.video.paused) piece.video.pause()
          piece.started = false
          continue
        }
        let source: CanvasImageSource | null = null
        let sw = 0
        let sh = 0
        if (piece.source.kind === "image" && piece.source.url && pictures.get(piece.source.url)) {
          const img = pictures.get(piece.source.url)!
          source = img
          sw = img.naturalWidth
          sh = img.naturalHeight
        } else if (piece.video) {
          if (!piece.started) {
            piece.started = true
            piece.video.playbackRate = speedOf(piece.fx)
            piece.video.currentTime = piece.trimIn + into * speedOf(piece.fx)
            void piece.video.play().catch(() => undefined)
          }
          if (piece.gain) piece.gain.gain.value = (piece.fx?.volume ?? 1) * fadeFactor(piece.fx, into, piece.duration) * overlapGain(pieces, piece, t)
          source = piece.video
          sw = piece.video.videoWidth
          sh = piece.video.videoHeight
        }
        if (source && sw > 0 && sh > 0) {
          if (gpu) items.push({ layer: piece.layer, start: piece.start, duration: piece.duration, fx: piece.fx, transitionIn: piece.transitionIn, source: source as TexImageSource, sw, sh })
          else drawWithFx(ctx, source, sw, sh, W, H, fallbackFx(pieces, piece, t), into, piece.duration)
        }
      }
      if (gpu) {
        composeAt(gpu, t, items)
        ctx.drawImage(gpu.canvas, 0, 0, W, H)
      }
      drawTexts(ctx, p, t, W, H)
      drawCaptions(ctx, p, t, W, H)
      for (const { a, el, gain } of sounds) {
        const inside = t >= a.start && t < a.start + a.duration
        if (inside) gain.gain.value = soundGain(p, a, t - a.start)
        if (inside && el.paused) {
          el.currentTime = t - a.start
          void el.play().catch(() => undefined)
        } else if (!inside && !el.paused) el.pause()
      }
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
  recorder.stop()
  gpu?.dispose()
  pieces.forEach((piece) => piece.video?.pause())
  sounds.forEach(({ el }) => el.pause())
  await finished
  void actx.close()
  if (signal?.aborted) throw new Error("The export was stopped.")
  const mime = type.split(";")[0] || "video/webm"
  return { blob: new Blob(chunks, { type: mime }), ext: mime.includes("mp4") ? "mp4" : "webm", seconds: length }
}
