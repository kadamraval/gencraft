import { ArrayBufferTarget, Muxer } from "mp4-muxer"
import { drawWithFx } from "./clip-fx"
import { Compositor } from "./compositor/compositor"
import { composeAt, fallbackFx, overlapSpans, type DrawItem } from "./compositor/frame"
import { loadProjectFonts } from "./project-fonts"
import { drawTexts } from "./text-render"
import { soundGain, exportSize, speedOf, totalLength, isOff, type EditProject } from "./edit-model"
import { fetchBytes } from "./media-local"
import { buildPieces, drawCaptions, loadPictures, type ExportInput, type Piece } from "./export-cut"

/**
 * The fast way to export: every frame is drawn on its own and handed to the browser's video encoder, so a cut takes as long as the
 * computer needs and not as long as the cut plays. The sound is mixed in one go off screen. The result is an MP4 written in the page.
 * It needs the browser's encoders (WebCodecs); where they are missing it says so and the caller uses the real-time export instead.
 */

export const FAST_UNSUPPORTED = "fast-export-unsupported"

export const fastExportAvailable = () => typeof VideoEncoder !== "undefined" && typeof AudioEncoder !== "undefined" && typeof VideoFrame !== "undefined" && typeof OfflineAudioContext !== "undefined"

const SAMPLE_RATE = 48000
const nextTick = () => new Promise<void>((r) => setTimeout(r, 0))

/** Moves a video to a time and waits until that picture is ready to draw */
function seek(v: HTMLVideoElement, time: number): Promise<void> {
  const to = Math.max(0, Math.min(time, Number.isFinite(v.duration) ? Math.max(0, v.duration - 0.01) : time))
  return new Promise<void>((done) => {
    if (Math.abs(v.currentTime - to) < 0.0005 && v.readyState >= 2) return done()
    let finished = false
    const end = () => {
      if (finished) return
      finished = true
      v.removeEventListener("seeked", end)
      done()
    }
    v.addEventListener("seeked", end)
    v.currentTime = to
    window.setTimeout(end, 3000)
  })
}

const loadVideo = (url: string) =>
  new Promise<HTMLVideoElement | null>((done) => {
    const v = document.createElement("video")
    v.crossOrigin = "anonymous"
    v.muted = true
    v.playsInline = true
    v.preload = "auto"
    v.onloadeddata = () => done(v)
    v.onerror = () => done(null)
    v.src = url
  })

async function pickVideoCodec(W: number, H: number, fps: number, bitrate: number): Promise<string | null> {
  for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42001f"]) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate, framerate: fps })
      if (r.supported) return codec
    } catch {
      // try the next one
    }
  }
  return null
}

const decodeSound = async (actx: BaseAudioContext, url: string): Promise<AudioBuffer | null> => {
  try {
    return await actx.decodeAudioData(await fetchBytes(url))
  } catch {
    return null
  }
}

/** The whole cut's sound, mixed off screen: the sound of each video clip and every sound on its lane, with speed, volume and fades */
async function mixSound(p: EditProject, pieces: Piece[], audioUrl: ExportInput["audioUrl"], from: number, length: number, signal?: AbortSignal): Promise<AudioBuffer> {
  const actx = new OfflineAudioContext(2, Math.max(1, Math.ceil(length * SAMPLE_RATE)), SAMPLE_RATE)
  const place = (buffer: AudioBuffer, start: number, duration: number, trimIn: number, speed: number, volume: number, fadeIn: number, fadeOut: number) => {
    // `start` and `duration` are on the timeline; part of the sound may fall before or after the stretch being exported
    const skip = Math.max(0, from - start)
    const when = Math.max(0, start - from)
    const span = Math.min(duration - skip, length - when)
    if (span <= 0) return
    const src = actx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = speed
    const gain = actx.createGain()
    const top = Math.max(0, volume)
    gain.gain.setValueAtTime(fadeIn > 0 && skip < fadeIn ? (top * skip) / fadeIn : top, when)
    if (fadeIn > 0 && skip < fadeIn) gain.gain.linearRampToValueAtTime(top, when + (fadeIn - skip))
    if (fadeOut > 0) {
      const outAt = when + span - Math.min(fadeOut, span)
      gain.gain.setValueAtTime(top, Math.max(outAt, when + (fadeIn > 0 ? Math.max(0, fadeIn - skip) : 0)))
      gain.gain.linearRampToValueAtTime(0, when + span)
    }
    src.connect(gain).connect(actx.destination)
    src.start(when, trimIn + skip * speed, span * speed)
  }

  /** A sound on a lane: its volume, fades, dips and the lane level, sampled 50 times a second into one gain curve */
  const placeCurve = (buffer: AudioBuffer, a: (typeof p.audio)[number]) => {
    const skip = Math.max(0, from - a.start)
    const when = Math.max(0, a.start - from)
    const span = Math.min(a.duration - skip, length - when)
    if (span <= 0.02) return
    const src = actx.createBufferSource()
    src.buffer = buffer
    const gain = actx.createGain()
    const n = Math.max(2, Math.ceil(span * 50) + 1)
    const curve = new Float32Array(n)
    for (let i = 0; i < n; i++) curve[i] = soundGain(p, a, skip + (Math.min(i, n - 1) / (n - 1)) * span)
    gain.gain.setValueCurveAtTime(curve, when, span)
    src.connect(gain).connect(actx.destination)
    src.start(when, skip, span)
  }

  const seen = new Map<string, AudioBuffer | null>()
  const bufferOf = async (url: string) => {
    if (!seen.has(url)) seen.set(url, await decodeSound(actx, url))
    return seen.get(url) ?? null
  }
  for (const piece of pieces) {
    if (signal?.aborted) break
    if (piece.source.kind !== "video" || !piece.source.url || isOff(p, `v${piece.layer}`)) continue
    const buffer = await bufferOf(piece.source.url)
    if (!buffer) continue // a video without sound
    // Where a transition overlaps two clips, the sound of one fades out as the other fades in
    const lap = overlapSpans(pieces, piece)
    place(buffer, piece.start, piece.duration, piece.trimIn, speedOf(piece.fx), piece.fx?.volume ?? 1, Math.max(piece.fx?.fadeIn ?? 0, lap.in), Math.max(piece.fx?.fadeOut ?? 0, lap.out))
  }
  for (const a of p.audio) {
    if (signal?.aborted) break
    if (isOff(p, `a${a.lane ?? 1}`)) continue
    const url = audioUrl(a.uploadId)
    const buffer = url ? await bufferOf(url) : null
    if (buffer) placeCurve(buffer, a)
  }
  return actx.startRendering()
}

export async function renderCutFast({ project: p, resolve, audioUrl, onProgress, options = {}, signal }: ExportInput): Promise<{ blob: Blob; ext: "mp4"; seconds: number }> {
  if (!fastExportAvailable()) throw new Error(FAST_UNSUPPORTED)
  const pieces = buildPieces(p, resolve)
  if (pieces.length === 0) throw new Error("There is nothing on the timeline to export.")
  const { W, H } = exportSize(p, options.res ?? 720)
  const fps = options.fps ?? 30
  const whole = totalLength(p)
  const from = Math.max(0, Math.min(options.from ?? 0, whole))
  const to = Math.max(from + 0.2, Math.min(options.to ?? whole, whole))
  const length = to - from
  const frames = Math.max(1, Math.round(length * fps))
  const bitrate = Math.round(6_000_000 * ((W * H) / (1280 * 720)))

  const codec = await pickVideoCodec(W, H, fps, bitrate)
  if (!codec) throw new Error(FAST_UNSUPPORTED)
  const audioCodec = (await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 128000 }).catch(() => ({ supported: false }))).supported ? "aac" : null
  if (!audioCodec) throw new Error(FAST_UNSUPPORTED)

  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("This window cannot draw the video.")
  // Frames are drawn on the graphics card when it is there (transitions need it), otherwise on the 2D canvas as before
  let gpu: Compositor | null = null
  try {
    gpu = Compositor.supported() ? new Compositor(W, H) : null
  } catch {
    gpu = null
  }

  await loadProjectFonts(p)
  const pictures = await loadPictures(pieces)
  const videos = new Map<string, HTMLVideoElement>()
  for (const piece of pieces) {
    if (piece.source.kind !== "video" || !piece.source.url) continue
    const v = await loadVideo(piece.source.url)
    if (v) videos.set(piece.id, v)
  }

  const target = new ArrayBufferTarget()
  const muxer = new Muxer({ target, video: { codec: "avc", width: W, height: H, frameRate: fps }, audio: { codec: "aac", numberOfChannels: 2, sampleRate: SAMPLE_RATE }, fastStart: "in-memory" })
  let failure: Error | null = null
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure = new Error(`The video encoder stopped: ${e.message}`)) })
  venc.configure({ codec, width: W, height: H, bitrate, framerate: fps })

  const stop = () => {
    try {
      venc.close()
    } catch {
      // already closed
    }
  }

  try {
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw new Error("The export was stopped.")
      if (failure) throw failure
      const t = from + i / fps
      ctx.fillStyle = "#000" // allow-color
      ctx.fillRect(0, 0, W, H)
      const items: DrawItem[] = []
      for (const piece of pieces) {
        if (t < piece.start || t >= piece.start + piece.duration || isOff(p, `v${piece.layer}`)) continue
        const into = t - piece.start
        let source: CanvasImageSource | null = null
        let sw = 0
        let sh = 0
        if (piece.source.kind === "image" && piece.source.url && pictures.get(piece.source.url)) {
          const img = pictures.get(piece.source.url)!
          source = img
          sw = img.naturalWidth
          sh = img.naturalHeight
        } else {
          const v = videos.get(piece.id)
          if (v) {
            await seek(v, piece.trimIn + into * speedOf(piece.fx))
            source = v
            sw = v.videoWidth
            sh = v.videoHeight
          }
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
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1_000_000) / fps), duration: Math.round(1_000_000 / fps) })
      venc.encode(frame, { keyFrame: i % (fps * 2) === 0 })
      frame.close()
      // Wait while the encoder has a backlog, and let the page breathe now and then
      while (venc.encodeQueueSize > 12) await nextTick()
      if (i % 4 === 0) {
        onProgress(Math.min(0.9, (i / frames) * 0.9))
        await nextTick()
      }
    }
    await venc.flush()
    if (failure) throw failure
    stop()

    // The sound
    onProgress(0.92)
    const mixed = await mixSound(p, pieces, audioUrl, from, length, signal)
    if (signal?.aborted) throw new Error("The export was stopped.")
    let audioFailure: Error | null = null
    const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (audioFailure = new Error(`The audio encoder stopped: ${e.message}`)) })
    aenc.configure({ codec: "mp4a.40.2", sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 128000 })
    const left = mixed.getChannelData(0)
    const right = mixed.numberOfChannels > 1 ? mixed.getChannelData(1) : left
    const chunk = 4096
    for (let at = 0; at < left.length; at += chunk) {
      const n = Math.min(chunk, left.length - at)
      const planar = new Float32Array(n * 2)
      planar.set(left.subarray(at, at + n), 0)
      planar.set(right.subarray(at, at + n), n)
      const data = new AudioData({ format: "f32-planar", sampleRate: SAMPLE_RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((at * 1_000_000) / SAMPLE_RATE), data: planar })
      aenc.encode(data)
      data.close()
      while (aenc.encodeQueueSize > 12) await nextTick()
    }
    await aenc.flush()
    aenc.close()
    if (audioFailure) throw audioFailure
    muxer.finalize()
    onProgress(1)
    return { blob: new Blob([target.buffer], { type: "video/mp4" }), ext: "mp4", seconds: length }
  } finally {
    stop()
    gpu?.dispose()
    videos.forEach((v) => {
      v.removeAttribute("src")
      v.load()
    })
  }
}

