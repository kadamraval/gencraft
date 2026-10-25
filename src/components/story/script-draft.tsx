import * as React from "react"
import { Plus, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useElements } from "@/lib/elements/store"
import { CATEGORY_LABEL } from "@/lib/elements/types"
import type { ElementItem } from "@/lib/elements/types"
import { cn } from "@/lib/utils"
import { ScriptBottomBar, ScriptRail, type ScriptSettings } from "./script-parts"
import type { DraftScene } from "./types"

interface Props {
  draft: DraftScene[]
  onChange: (draft: DraftScene[]) => void
  /** Turns the notes into a standard script. Resolves when the script is on the Standard tab; throws why it could not. */
  onMake: (notes: string, elements: ElementItem[]) => Promise<void>
  onOpenScript: () => void
  /** Set when there is a script to break into scenes */
  onBreak?: () => void
  settings: ScriptSettings
  full: boolean
  onToggleFull: () => void
  title: string
}

export interface DraftEditorHandle {
  insertText: (text: string) => void
}

let counter = 0
const newScene = (title = "", text = ""): DraftScene => ({ id: `d${Date.now().toString(36)}${(counter++).toString(36)}`, title, text })

/** The notes as plain text, one scene after another */
export const draftText = (draft: DraftScene[]) =>
  draft
    .filter((s) => s.title.trim() || s.text.trim())
    .map((s, i) => `Scene ${i + 1}${s.title.trim() ? ` (${s.title.trim()})` : ""}:\n${s.text.trim()}`)
    .join("\n\n")

/** Elements named with "@" in some text */
export function mentionedElements(text: string, all: ElementItem[]): ElementItem[] {
  const lower = text.toLowerCase()
  return all.filter((el) => lower.includes(`@${el.name.toLowerCase()}`))
}

/**
 * The Normal tab: a story written in plain words. "/" starts a new scene, "@" brings in one of your Elements
 * (a character, a place, a prop), and "Make script" turns the notes into a standard screenplay on the Standard tab.
 */
export const DraftEditor = React.forwardRef<DraftEditorHandle, Props>(function DraftEditor({ draft, onChange, onMake, onOpenScript, onBreak, settings, full, onToggleFull, title }, handle) {
  const [scenes, setScenes] = React.useState<DraftScene[]>(() => (draft.length ? draft : [newScene()]))
  const scenesRef = React.useRef(scenes)
  scenesRef.current = scenes
  const [activeId, setActiveId] = React.useState<string>(() => scenes[0]!.id)
  const fields = React.useRef(new Map<string, HTMLTextAreaElement>())
  const pendingFocus = React.useRef<{ id: string; at: number } | null>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)
  const emitted = React.useRef(draft)
  const onChangeRef = React.useRef(onChange)
  onChangeRef.current = onChange
  const [mention, setMention] = React.useState<{ id: string; start: number; query: string; pick: number } | null>(null)
  const [making, setMaking] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const elements = useElements()

  // Hand the notes up shortly after typing stops
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (scenes === emitted.current) return
      emitted.current = scenes
      onChangeRef.current(scenes)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [scenes])

  const update = (next: DraftScene[]) => {
    scenesRef.current = next
    setScenes(next)
  }
  const patch = (id: string, change: Partial<DraftScene>) => update(scenesRef.current.map((s) => (s.id === id ? { ...s, ...change } : s)))

  React.useLayoutEffect(() => {
    fields.current.forEach((el) => {
      el.style.height = "auto"
      el.style.height = `${Math.max(el.scrollHeight, 96)}px`
    })
    const want = pendingFocus.current
    const el = want ? fields.current.get(want.id) : undefined
    if (want && el) {
      pendingFocus.current = null
      el.focus()
      el.setSelectionRange(want.at, want.at)
    }
  })

  const matches = React.useMemo(() => {
    if (!mention) return []
    const q = mention.query.toLowerCase()
    return elements.filter((el) => el.name.toLowerCase().includes(q)).slice(0, 6)
  }, [mention, elements])

  const chooseElement = (el: ElementItem) => {
    if (!mention) return
    const scene = scenesRef.current.find((s) => s.id === mention.id)
    if (!scene) return
    const caret = mention.start + 1 + mention.query.length
    const inserted = `@${el.name} `
    patch(scene.id, { text: scene.text.slice(0, mention.start) + inserted + scene.text.slice(caret) })
    pendingFocus.current = { id: scene.id, at: mention.start + inserted.length }
    setMention(null)
  }

  const onText = (scene: DraftScene, el: HTMLTextAreaElement) => {
    const raw = el.value
    const caret = el.selectionStart
    // "/" at the start of a line starts a new scene: what follows it moves to the new scene
    if (raw[caret - 1] === "/" && (caret === 1 || raw[caret - 2] === "\n")) {
      const before = raw.slice(0, caret - 1).replace(/\n$/, "")
      const after = raw.slice(caret).replace(/^\n/, "")
      const created = newScene("", after)
      const list = scenesRef.current
      const at = list.findIndex((s) => s.id === scene.id)
      update([...list.slice(0, at), { ...scene, text: before }, created, ...list.slice(at + 1)])
      pendingFocus.current = { id: created.id, at: 0 }
      setActiveId(created.id)
      setMention(null)
      return
    }
    patch(scene.id, { text: raw })
    const m = /(^|\s)@([^\s@]*)$/.exec(raw.slice(0, caret))
    setMention(m ? { id: scene.id, start: caret - m[2]!.length - 1, query: m[2]!, pick: 0 } : null)
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mention || matches.length === 0) return
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      setMention({ ...mention, pick: (mention.pick + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length })
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault()
      chooseElement(matches[mention.pick] ?? matches[0]!)
    } else if (e.key === "Escape") {
      setMention(null)
    }
  }

  const removeScene = (id: string) => {
    const left = scenesRef.current.filter((s) => s.id !== id)
    update(left.length ? left : [newScene()])
  }

  const insertText = (text: string) => {
    const list = scenesRef.current
    const scene = list.find((s) => s.id === activeId) ?? list[list.length - 1]!
    patch(scene.id, { text: scene.text && !/s$/.test(scene.text) ? `${scene.text} ${text}` : `${scene.text}${text}` })
    pendingFocus.current = { id: scene.id, at: scene.text.length + text.length + 1 }
  }
  React.useImperativeHandle(handle, () => ({ insertText }))

  const hasNotes = scenes.some((s) => s.text.trim() || s.title.trim())
  const words = scenes.reduce((n, s) => n + (s.text.trim() ? s.text.trim().split(/\s+/).length : 0), 0)

  const make = async () => {
    setError(null)
    setMaking(true)
    try {
      const text = draftText(scenesRef.current)
      await onMake(text, mentionedElements(text, elements))
    } catch (e) {
      setError(e instanceof Error ? e.message : "The script could not be made.")
    } finally {
      setMaking(false)
    }
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([draftText(scenes)], { type: "text/plain" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "notes"}-notes.txt`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
  const upload = async (file: File | undefined) => {
    if (!file) return
    const text = (await file.text()).trim()
    if (fileInput.current) fileInput.current.value = ""
    if (!text) return
    const only = scenesRef.current.length === 1 && !scenesRef.current[0]!.text.trim() && !scenesRef.current[0]!.title.trim()
    update(only ? [newScene("", text)] : [...scenesRef.current, newScene("", text)])
  }

  return (
    <div className="group/script relative flex min-h-0 flex-1 flex-col">
      <Input ref={fileInput} type="file" accept=".txt,.md,text/plain" className="hidden" aria-label="Upload notes" onChange={(e) => void upload(e.target.files?.[0])} />
      <div className="min-h-0 flex-1 overflow-auto bg-secondary/10 px-6 py-6 no-scrollbar">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {scenes.map((scene, i) => (
            <div key={scene.id} className="group/row relative rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Scene {i + 1}</span>
                <Input
                  value={scene.title}
                  onChange={(e) => patch(scene.id, { title: e.target.value })}
                  aria-label={`Scene ${i + 1} title`}
                  placeholder="Where and when (optional)"
                  className="h-7 min-w-0 flex-1 border-0 bg-transparent px-2 text-sm font-semibold shadow-none focus-visible:bg-secondary/40"
                />
                {scenes.length > 1 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeScene(scene.id)} aria-label={`Remove scene ${i + 1}`} className="h-6 w-6 text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove this scene</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="relative">
                <Textarea
                  ref={(el) => {
                    if (el) fields.current.set(scene.id, el)
                    else fields.current.delete(scene.id)
                  }}
                  value={scene.text}
                  aria-label={`Scene ${i + 1} notes`}
                  placeholder={i === 0 && scenes.length === 1 ? "Write what happens, in your own words. Type / on a new line to start the next scene, or @ to bring in a character or place." : "What happens in this scene"}
                  onFocus={() => setActiveId(scene.id)}
                  onChange={(e) => onText(scene, e.target)}
                  onKeyDown={onKey}
                  onBlur={() => window.setTimeout(() => setMention((m) => (m && m.id === scene.id ? null : m)), 120)}
                  className="min-h-24 w-full rounded-md px-2 py-1 text-sm leading-relaxed"
                />
                {mention && mention.id === scene.id && matches.length > 0 && (
                  <div className="absolute left-2 top-full z-30 mt-1 w-64 rounded-lg border border-border bg-popover p-1 shadow-lg">
                    {matches.map((el, n) => (
                      <Button
                        key={el.id}
                        type="button"
                        variant="ghost"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => chooseElement(el)}
                        className={cn("h-9 w-full justify-start gap-2 px-2", mention.pick === n && "bg-accent")}
                      >
                        {el.imageUrls[0] ? <img src={el.imageUrls[0]} alt="" className="h-6 w-6 flex-shrink-0 rounded-full object-cover" /> : <span className="h-6 w-6 flex-shrink-0 rounded-full bg-secondary" aria-hidden="true" />}
                        <span className="min-w-0 flex-1 truncate text-left text-xs font-medium">{el.name}</span>
                        <span className="text-xs text-muted-foreground">{CATEGORY_LABEL[el.category]}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => update([...scenesRef.current, newScene()])} className="h-9 gap-1.5 text-xs text-muted-foreground">
              <Plus className="h-3.5 w-3.5" />
              New scene
            </Button>
            <Button type="button" size="sm" onClick={() => void make()} disabled={!hasNotes || making} className="ml-auto gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              {making ? "Writing the script…" : "Make script"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Make script writes these notes as a standard screenplay on the{" "}
            <Button type="button" variant="link" onClick={onOpenScript} className="h-auto p-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
              Standard tab
            </Button>
            .
          </p>
        </div>
      </div>

      <ScriptRail full={full} onToggleFull={onToggleFull} onDownload={download} onUpload={() => fileInput.current?.click()} onBreak={onBreak} breakNote="Make the script first, then break it into scenes" />
      <ScriptBottomBar
        settings={settings}
        onText={insertText}
        hint="/ new scene · @ an element"
        info={
          <>
            <span>
              {scenes.length} {scenes.length === 1 ? "scene" : "scenes"}
            </span>
            <span>{words} words</span>
          </>
        }
      />
    </div>
  )
})
