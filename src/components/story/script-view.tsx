import * as React from "react"
import { Button } from "@/components/ui/button"
import { askYesNo } from "@/lib/notice"
import { cn } from "@/lib/utils"
import type { ElementItem } from "@/lib/elements/types"
import { CATEGORY_LABEL } from "@/lib/elements/types"
import { DraftEditor, type DraftEditorHandle } from "./script-draft"
import { ScriptEditor, stripFences, type ScriptEditorHandle } from "./script-editor"
import type { ScriptSettings } from "./script-parts"
import { parseFountain, scenesOf, type ScriptScene } from "./fountain"
import type { DraftScene } from "./types"

interface Props {
  /** The standard script as Fountain text */
  value: string
  onChange: (text: string) => void
  draft: DraftScene[]
  onDraftChange: (draft: DraftScene[]) => void
  title: string
  logline: string
  onGenerateText?: (prompt: string) => Promise<string>
  onBreakIntoScenes: (scenes: ScriptScene[]) => void
  settings: ScriptSettings
}

type Tab = "normal" | "standard"

/**
 * The Script tab has two ways to write. Normal is plain words in a card for each scene ("/" starts a scene, "@"
 * brings in an Element); Standard is the industry screenplay page. "Make script" turns Normal into Standard.
 * Both stay open, so the agent can always write into the Standard page.
 */
export const ScriptTab = React.forwardRef<ScriptEditorHandle, Props>(function ScriptTab({ value, onChange, draft, onDraftChange, title, logline, onGenerateText, onBreakIntoScenes, settings }, handle) {
  const [tab, setTab] = React.useState<Tab>(() => (value.trim() || !draft.length ? "standard" : "normal"))
  const [full, setFull] = React.useState(false)
  const standard = React.useRef<ScriptEditorHandle>(null)
  const normal = React.useRef<DraftEditorHandle>(null)

  React.useImperativeHandle(handle, () => ({
    ask: async (request) => {
      setTab("standard")
      return standard.current!.ask(request)
    },
    insertText: (text) => (tab === "normal" ? normal.current : standard.current)?.insertText(text),
    load: (text) => standard.current?.load(text),
  }))

  // Esc leaves full screen writing
  React.useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [full])

  const make = async (notes: string, elements: ElementItem[]) => {
    if (!onGenerateText) throw new Error("Add a key and switch on a chat model in Settings, Providers, so the agent can write.")
    if (value.trim() && !(await askYesNo("Replace the standard script?", "Make script writes a new script from these notes and replaces what is on the Standard tab. You can undo it with Ctrl+Z there."))) return
    const known = elements.length
      ? `\n\nElements named with @ (keep each name exactly, as a character name, a place or a prop):\n${elements.map((el) => `@${el.name}: ${CATEGORY_LABEL[el.category]}${el.text ? `. ${el.text}` : ""}`).join("\n")}`
      : ""
    const prompt = [
      "You are a professional screenwriter. Turn the notes below into a screenplay in Fountain format (fountain.io): scene headings start with INT. or EXT. in capitals with a place and time, such as INT. WAREHOUSE - NIGHT; action is plain text, short and visual: only what can be seen and heard; a character name is in capitals on its own line with the dialogue directly under it; a parenthetical is in round brackets on its own line under the name; a transition is in capitals ending with TO:. Put one blank line between elements. Keep every scene in the order given and do not add events the notes do not have. Reply with the screenplay text only: no commentary, no markdown, no code fences.",
      `Story: ${title}.${logline ? ` Premise: ${logline}` : ""}`,
      `The notes:\n${notes}${known}`,
    ].join("\n\n")
    const reply = await onGenerateText(prompt)
    const text = stripFences(reply)
    if (parseFountain(text).length === 0) throw new Error("The agent did not return any script.")
    standard.current?.load(text)
    setTab("standard")
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "normal", label: "Normal" },
    { id: "standard", label: "Standard" },
  ]

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", full && "fixed inset-0 z-50 bg-background")}>
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border/40 px-4 py-2">
        <div className="flex items-center rounded-lg border border-border/70 bg-secondary/40 p-0.5" role="tablist" aria-label="Way of writing">
          {tabs.map((t) => (
            <Button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              variant="ghost"
              size="sm"
              onClick={() => setTab(t.id)}
              className={cn("h-7 rounded-md px-3 text-xs", tab === t.id ? "bg-card font-semibold text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{tab === "normal" ? "Write in your own words" : "The industry screenplay format"}</span>
      </div>

      <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "normal" && "hidden")}>
        <DraftEditor
          ref={normal}
          draft={draft}
          onChange={onDraftChange}
          onMake={make}
          onOpenScript={() => setTab("standard")}
          onBreak={value.trim() ? () => onBreakIntoScenes(scenesOf(parseFountain(value))) : undefined}
          settings={settings}
          full={full}
          onToggleFull={() => setFull((f) => !f)}
          title={title}
        />
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "standard" && "hidden")}>
        <ScriptEditor
          ref={standard}
          value={value}
          onChange={onChange}
          title={title}
          logline={logline}
          onGenerateText={onGenerateText}
          onBreakIntoScenes={onBreakIntoScenes}
          settings={settings}
          full={full}
          onToggleFull={() => setFull((f) => !f)}
        />
      </div>
    </div>
  )
})
