import * as React from "react"

interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}

interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}

interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((e: RecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

type RecognitionCtor = new () => Recognition

function getCtor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/** Browser speech-to-text. Finalized phrases arrive through onText. */
export function useDictation(onText: (text: string) => void, language?: string) {
  const [listening, setListening] = React.useState(false)
  const recRef = React.useRef<Recognition | null>(null)
  const onTextRef = React.useRef(onText)
  onTextRef.current = onText
  const supported = Boolean(getCtor())

  const stop = React.useCallback(() => {
    recRef.current?.stop()
  }, [])

  const start = React.useCallback(() => {
    if (recRef.current) return
    const Ctor = getCtor()
    if (!Ctor) return
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = false
    rec.lang = language || navigator.language || "en-US"
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r?.isFinal) onTextRef.current(r[0].transcript.trim())
      }
    }
    rec.onend = () => {
      setListening(false)
      recRef.current = null
    }
    rec.onerror = () => setListening(false)
    recRef.current = rec
    rec.start()
    setListening(true)
  }, [])

  const toggle = React.useCallback(() => {
    if (recRef.current) stop()
    else start()
  }, [start, stop])

  React.useEffect(() => () => recRef.current?.stop(), [])

  return { supported, listening, start, stop, toggle }
}
