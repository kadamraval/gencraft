import * as React from "react"

/**
 * Listens through the microphone and turns speech into text with a model (see lib/voice/speech.ts).
 *
 * Dictation records until it is stopped, then transcribes once. Talk mode listens all the time: each time
 * the person finishes a phrase (a pause of about a second and a quarter) that phrase is transcribed, and
 * listening carries on.
 */

const SPEAKING_LEVEL = 0.018
const PAUSE_MS = 1250
const TOO_SHORT_MS = 450

interface Options {
  /** Off when the browser's own speech is used instead */
  enabled: boolean
  transcribe: (audio: Blob) => Promise<string>
  onText: (text: string) => void
  onError: (message: string) => void
  /** Talk mode: split into phrases on pauses */
  continuous: () => boolean
}

export function useRecordedSpeech(opts: Options) {
  const [listening, setListening] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const optsRef = React.useRef(opts)
  optsRef.current = opts
  const live = React.useRef<{ stream: MediaStream; ctx: AudioContext; timer: number; recorder: MediaRecorder | null } | null>(null)
  const supported = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined"

  const handle = React.useCallback(async (blob: Blob, ms: number) => {
    if (ms < TOO_SHORT_MS || blob.size < 1000) return
    setBusy(true)
    try {
      const text = (await optsRef.current.transcribe(blob)).trim()
      if (text) optsRef.current.onText(text)
    } catch (e) {
      optsRef.current.onError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const cleanup = React.useCallback(() => {
    const l = live.current
    if (!l) return
    window.clearInterval(l.timer)
    if (l.recorder && l.recorder.state !== "inactive") l.recorder.stop()
    l.stream.getTracks().forEach((t) => t.stop())
    void l.ctx.close().catch(() => undefined)
    live.current = null
    setListening(false)
  }, [])

  const stop = React.useCallback(() => cleanup(), [cleanup])

  const start = React.useCallback(async () => {
    if (live.current || !optsRef.current.enabled) return
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      optsRef.current.onError("The microphone is blocked. Allow it for this app and try again.")
      return
    }
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(analyser)
    const samples = new Float32Array(analyser.fftSize)

    const record = (): MediaRecorder => {
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      const startedAt = Date.now()
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
      recorder.onstop = () => void handle(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }), Date.now() - startedAt)
      recorder.start()
      return recorder
    }

    let silentFor = 0
    let spoke = false
    const state = { stream, ctx, timer: 0, recorder: null as MediaRecorder | null }
    live.current = state

    if (!optsRef.current.continuous()) {
      // Dictation: one recording, until stop
      state.recorder = record()
    } else {
      state.timer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples)
        let sum = 0
        for (const v of samples) sum += v * v
        const level = Math.sqrt(sum / samples.length)
        if (level > SPEAKING_LEVEL) {
          silentFor = 0
          spoke = true
          if (!state.recorder || state.recorder.state === "inactive") state.recorder = record()
        } else if (spoke) {
          silentFor += 100
          if (silentFor >= PAUSE_MS) {
            spoke = false
            silentFor = 0
            if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop()
            state.recorder = null
          }
        }
      }, 100)
    }
    setListening(true)
  }, [handle])

  React.useEffect(() => cleanup, [cleanup])

  return { supported, listening, busy, start, stop }
}
