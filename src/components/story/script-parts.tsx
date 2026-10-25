import * as React from "react"
import { Download, Maximize2, Mic, Minimize2, Square, Clapperboard, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDictation } from "@/components/composer/use-dictation"
import { useRecordedSpeech } from "@/components/composer/use-recorded-speech"
import { sttModel, transcribe } from "@/lib/voice/speech"
import type { ChatInput } from "@/components/chat/chat-input"
import { cn } from "@/lib/utils"

export type ScriptSettings = React.ComponentProps<typeof ChatInput>["settings"]

/** The four tools at the right edge, shown when the pointer is over the page */
export function ScriptRail({
  full,
  onToggleFull,
  onDownload,
  onUpload,
  onBreak,
  breakNote,
}: {
  full: boolean
  onToggleFull: () => void
  onDownload: () => void
  onUpload: () => void
  /** Missing when there is no script to break yet */
  onBreak?: () => void
  breakNote: string
}) {
  const item = (label: string, icon: React.ReactNode, onClick: (() => void) | undefined, note?: string) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button type="button" variant="ghost" size="icon" onClick={onClick} disabled={!onClick} aria-label={label} className="h-8 w-8 text-muted-foreground">
            {icon}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="left">{note ?? label}</TooltipContent>
    </Tooltip>
  )
  return (
    <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-xl border border-border/60 bg-card/90 p-1 opacity-0 shadow-md transition-opacity focus-within:opacity-100 group-hover/script:opacity-100">
      {item("Download", <Download className="h-4 w-4" />, onDownload)}
      {item("Upload", <Upload className="h-4 w-4" />, onUpload)}
      {item("Scene break", <Clapperboard className="h-4 w-4" />, onBreak, onBreak ? "Break into scenes: a scene for each heading, a beat for each thing we see" : breakNote)}
      {item(full ? "Leave full screen" : "Full screen writing", full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />, onToggleFull)}
    </div>
  )
}

/** Speech to text: the browser's own, or a speech model when one is chosen in Settings (the same choice the composer makes) */
function useScriptSpeech(settings: ScriptSettings, onText: (text: string) => void) {
  const [note, setNote] = React.useState<string | null>(null)
  const heard = React.useCallback(
    (text: string) => {
      setNote(null)
      onText(text)
    },
    [onText],
  )
  const browser = useDictation(heard, settings?.aiEngine.speechLanguage)
  const modelChosen = Boolean(settings && sttModel(settings))
  const recorded = useRecordedSpeech({
    enabled: modelChosen,
    transcribe: (audio) => (settings ? transcribe(audio, settings) : Promise.resolve("")),
    onText: heard,
    onError: setNote,
    continuous: () => false,
  })
  if (modelChosen) {
    return { supported: recorded.supported, listening: recorded.listening, busy: recorded.busy, toggle: () => (recorded.listening ? recorded.stop() : void recorded.start()), note }
  }
  return { supported: browser.supported, listening: browser.listening, busy: false, toggle: browser.toggle, note }
}

/** The bar at the bottom: writing info, the round speak button in the middle, and a hint */
export function ScriptBottomBar({ info, hint, settings, onText }: { info: React.ReactNode; hint: string; settings: ScriptSettings; onText: (text: string) => void }) {
  const speech = useScriptSpeech(settings, onText)
  const label = speech.listening ? "Stop listening" : "Speak to write"
  return (
    <div className="grid flex-shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-border/40 bg-background/30 px-4 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">{info}</div>
      <div className="flex flex-col items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              // The click must not take the cursor out of the box being written in
              onMouseDown={(e) => e.preventDefault()}
              onClick={speech.toggle}
              disabled={!speech.supported || speech.busy}
              aria-label={label}
              aria-pressed={speech.listening}
              className={cn("h-10 w-10 rounded-full", speech.listening && "animate-pulse bg-destructive text-destructive-foreground")}
            >
              {speech.listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{speech.supported ? (speech.busy ? "Writing what you said" : label) : "Speech is not available here. Choose a speech model in Settings."}</TooltipContent>
        </Tooltip>
        {speech.note && <span className="max-w-64 truncate text-xs text-destructive">{speech.note}</span>}
      </div>
      <div className="truncate text-right text-xs text-muted-foreground">{hint}</div>
    </div>
  )
}
