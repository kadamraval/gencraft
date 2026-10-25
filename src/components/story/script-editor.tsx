import * as React from "react"
import { Redo2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { askYesNo } from "@/lib/notice"
import { cn } from "@/lib/utils"
import { ScriptBottomBar, ScriptRail, type ScriptSettings } from "./script-parts"
import {
  BLOCK_LABEL,
  COLUMNS,
  LINES_PER_PAGE,
  TAB_ORDER,
  blockLineCounts,
  characterNames,
  makeBlock,
  parseFountain,
  scenesOf,
  scriptStats,
  toFountain,
  type BlockType,
  type ScriptBlock,
  type ScriptScene,
} from "./fountain"

interface Props {
  /** The script as Fountain text */
  value: string
  onChange: (text: string) => void
  title: string
  logline: string
  /** Asks the chat model for text. Missing when no chat model is ready. */
  onGenerateText?: (prompt: string) => Promise<string>
  /** Turns the script's scenes into scenes and shots of the story */
  onBreakIntoScenes: (scenes: ScriptScene[]) => void
  settings: ScriptSettings
  full: boolean
  onToggleFull: () => void
}

type AgentMode = "continue" | "scene" | "all"
const ELEMENTS: Array<{ type: BlockType; label: string }> = [
  { type: "scene", label: BLOCK_LABEL.scene },
  { type: "action", label: BLOCK_LABEL.action },
  { type: "character", label: BLOCK_LABEL.character },
  { type: "parenthetical", label: BLOCK_LABEL.parenthetical },
  { type: "dialogue", label: BLOCK_LABEL.dialogue },
  { type: "transition", label: BLOCK_LABEL.transition },
]

/** What Return starts after each kind of line, as in Final Draft */
const NEXT: Record<BlockType, BlockType> = {
  scene: "action",
  action: "action",
  character: "dialogue",
  parenthetical: "dialogue",
  dialogue: "action",
  transition: "scene",
  act: "scene",
  note: "action",
}

const PLACEHOLDER: Record<BlockType, string> = {
  scene: "INT. LOCATION - DAY",
  action: "Describe what we see and hear.",
  character: "CHARACTER",
  parenthetical: "how it is said",
  dialogue: "What they say.",
  transition: "CUT TO:",
  act: "ACT",
  note: "A note to yourself. It is not filmed.",
}

const TIMES = ["DAY", "NIGHT", "DAWN", "DUSK", "MORNING", "EVENING", "CONTINUOUS", "LATER", "MOMENTS LATER"]
const TRANSITIONS = ["CUT TO:", "SMASH CUT TO:", "MATCH CUT TO:", "JUMP CUT TO:", "DISSOLVE TO:", "FADE IN:", "FADE OUT."]
const PARENTHETICALS = ["beat", "quietly", "whispering", "angrily", "to himself", "to herself", "pause", "into comms"]
const UPPERCASE = new Set<BlockType>(["scene", "character", "transition"])

/** Text as the block type wants it: capitals for headings, cues and transitions; no brackets inside a parenthetical */
function shape(type: BlockType, text: string): string {
  if (UPPERCASE.has(type)) return text.toUpperCase()
  if (type === "parenthetical") return text.replace(/^\(|\)$/g, "")
  return text
}

const startBlocks = (text: string): ScriptBlock[] => {
  const blocks = parseFountain(text)
  return blocks.length ? blocks : [makeBlock("action")]
}

function suggestionsFor(block: ScriptBlock, all: ScriptBlock[]): string[] {
  const text = block.text
  const lower = text.toLowerCase()
  const starts = (list: string[]) => list.filter((s) => s.toLowerCase().startsWith(lower) && s.toLowerCase() !== lower).slice(0, 5)
  if (block.type === "character") {
    const others = characterNames(all.filter((b) => b.id !== block.id))
    return starts(others)
  }
  if (block.type === "transition") return starts(TRANSITIONS)
  if (block.type === "parenthetical") return starts(PARENTHETICALS)
  if (block.type === "scene") {
    if (text.length <= 4 && !text.includes(" ")) return starts(["INT. ", "EXT. ", "INT./EXT. "])
    const dash = text.lastIndexOf(" - ")
    if (dash >= 0) return TIMES.filter((t) => t.toLowerCase().startsWith(text.slice(dash + 3).toLowerCase()) && t !== text.slice(dash + 3)).map((t) => text.slice(0, dash + 3) + t).slice(0, 5)
    const places = [...new Set(all.filter((b) => b.type === "scene" && b.id !== block.id).map((b) => b.text.split(" - ")[0]!.trim()))]
    return starts(places)
  }
  return []
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export const stripFences = (s: string) => s.replace(/^\s*```[a-z]*\n?/i, "").replace(/\n?```\s*$/i, "").trim()

/**
 * The Standard tab: a screenplay editor. The page is set the way a script is typeset (Courier 12, ten characters to
 * the inch, a 1.5 inch left margin, about 55 lines a page), every line has a kind (scene heading, action,
 * character, parenthetical, dialogue, transition) that decides where it sits, and Return and Tab behave as in
 * Final Draft. The agent can write or rewrite through the handle. The script is kept as Fountain text.
 */
export interface ScriptEditorHandle {
  /** The agent writes or rewrites from a request. Returns what it did, or throws why it could not. */
  ask: (request: string) => Promise<string>
  /** Puts spoken words at the end of the line being written */
  insertText: (text: string) => void
  /** Replaces the page with a script (Fountain text) */
  load: (text: string) => void
}

export const ScriptEditor = React.forwardRef<ScriptEditorHandle, Props>(function ScriptEditor({ value, onChange, title, logline, onGenerateText, onBreakIntoScenes, settings, full, onToggleFull }, handle) {
  const [blocks, setBlocks] = React.useState<ScriptBlock[]>(() => startBlocks(value))
  const blocksRef = React.useRef(blocks)
  const [activeId, setActiveId] = React.useState<string>(() => blocks[0]!.id)
  const history = React.useRef<{ past: ScriptBlock[][]; future: ScriptBlock[][]; lastAt: number }>({ past: [], future: [], lastAt: 0 })
  const emitted = React.useRef(value)
  const fields = React.useRef(new Map<string, HTMLTextAreaElement>())
  const pendingFocus = React.useRef<{ id: string; at: "start" | "end" | number } | null>(null)
  const scroller = React.useRef<HTMLDivElement>(null)
  const ruler = React.useRef<HTMLSpanElement>(null)
  const importInput = React.useRef<HTMLInputElement>(null)

  const [suggest, setSuggest] = React.useState<{ id: string; items: string[] } | null>(null)
  const [fit, setFit] = React.useState(1)

  blocksRef.current = blocks
  const onChangeRef = React.useRef(onChange)
  onChangeRef.current = onChange

  // The script changed from outside (another story was opened): start again from it
  React.useEffect(() => {
    if (value === emitted.current) return
    emitted.current = value
    const next = startBlocks(value)
    blocksRef.current = next
    setBlocks(next)
    setActiveId(next[0]!.id)
    history.current = { past: [], future: [], lastAt: 0 }
  }, [value])

  // Hand the text up shortly after typing stops
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const text = toFountain(blocks)
      if (text === emitted.current) return
      emitted.current = text
      onChangeRef.current(text)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [blocks])

  const commit = React.useCallback((next: ScriptBlock[], coalesce = false) => {
    const h = history.current
    const now = Date.now()
    if (!(coalesce && h.past.length > 0 && now - h.lastAt < 800)) {
      h.past.push(blocksRef.current)
      if (h.past.length > 100) h.past.shift()
    }
    h.lastAt = now
    h.future = []
    blocksRef.current = next
    setBlocks(next)
  }, [])

  const undo = () => {
    const h = history.current
    const prev = h.past.pop()
    if (!prev) return
    h.future.push(blocksRef.current)
    blocksRef.current = prev
    setBlocks(prev)
  }
  const redo = () => {
    const h = history.current
    const next = h.future.pop()
    if (!next) return
    h.past.push(blocksRef.current)
    blocksRef.current = next
    setBlocks(next)
  }

  const focusBlock = (id: string, at: "start" | "end" | number = "end") => {
    pendingFocus.current = { id, at }
    const el = fields.current.get(id)
    if (el) applyFocus()
  }
  const applyFocus = () => {
    const want = pendingFocus.current
    if (!want) return
    const el = fields.current.get(want.id)
    if (!el) return
    pendingFocus.current = null
    el.focus()
    const pos = want.at === "start" ? 0 : want.at === "end" ? el.value.length : want.at
    el.setSelectionRange(pos, pos)
  }

  // Every line grows to fit its text, and a requested focus lands once the line exists
  React.useLayoutEffect(() => {
    fields.current.forEach((el) => {
      el.style.height = "auto"
      el.style.height = `${el.scrollHeight}px`
    })
    applyFocus()
  })

  // The page shrinks to the room there is; the page is 8.5 inches, 85 characters wide
  React.useLayoutEffect(() => {
    const box = scroller.current
    const rule = ruler.current
    if (!box || !rule) return
    const measure = () => setFit(Math.min(1, Math.max(0.4, (box.clientWidth - 48) / rule.offsetWidth)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [])
  const zoom = fit

  const indexOf = (id: string) => blocksRef.current.findIndex((b) => b.id === id)
  const setText = (id: string, text: string) => {
    const cur = blocksRef.current
    commit(cur.map((b) => (b.id === id ? { ...b, text } : b)), true)
  }
  const changeType = (id: string, type: BlockType) => {
    const cur = blocksRef.current
    commit(cur.map((b) => (b.id === id ? { ...b, type, text: shape(type, b.text) } : b)))
    focusBlock(id, "end")
  }

  const insertAfter = (index: number, inserted: ScriptBlock[], replaceCurrent = false) => {
    const cur = blocksRef.current
    const next = [...cur.slice(0, replaceCurrent ? index : index + 1), ...inserted, ...cur.slice(index + 1)]
    commit(next)
    focusBlock(inserted[inserted.length - 1]!.id, "end")
  }

  const onEnter = (b: ScriptBlock, i: number, from: number, to: number) => {
    if (!b.text && b.type !== "action") {
      changeType(b.id, "action")
      return
    }
    const before = b.text.slice(0, from)
    const after = b.text.slice(to)
    const nextType = after ? b.type : NEXT[b.type]
    const created = makeBlock(nextType, shape(nextType, after))
    const cur = blocksRef.current
    commit([...cur.slice(0, i), { ...b, text: before }, created, ...cur.slice(i + 1)])
    focusBlock(created.id, "start")
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, b: ScriptBlock, i: number) => {
    const el = e.currentTarget
    const from = el.selectionStart
    const to = el.selectionEnd
    const cur = blocksRef.current

    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase()
      if (k === "z") {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (k === "y") {
        e.preventDefault()
        redo()
      }
      return
    }
    if (e.key === "Escape") {
      setSuggest(null)
      return
    }
    if (e.key === "Tab") {
      e.preventDefault()
      const items = suggestionsFor(b, cur)
      if (!e.shiftKey && items.length > 0 && b.text) {
        setText(b.id, shape(b.type, items[0]!))
        setSuggest(null)
        return
      }
      const at = TAB_ORDER.indexOf(b.type)
      const next = TAB_ORDER[(Math.max(0, at) + (e.shiftKey ? TAB_ORDER.length - 1 : 1)) % TAB_ORDER.length]!
      changeType(b.id, next)
      return
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      setSuggest(null)
      onEnter(b, i, from, to)
      return
    }
    if (e.key === "Backspace" && from === 0 && to === 0 && i > 0) {
      const prev = cur[i - 1]!
      if (!b.text && cur.length > 1) {
        e.preventDefault()
        commit(cur.filter((x) => x.id !== b.id))
        focusBlock(prev.id, "end")
      } else if (prev.type === b.type && (b.type === "action" || b.type === "dialogue")) {
        e.preventDefault()
        const at = prev.text.length + 1
        commit([...cur.slice(0, i - 1), { ...prev, text: `${prev.text}\n${b.text}` }, ...cur.slice(i + 1)])
        focusBlock(prev.id, at)
      }
      return
    }
    if (e.key === "ArrowUp" && from === 0 && to === 0 && i > 0) {
      e.preventDefault()
      focusBlock(cur[i - 1]!.id, "end")
    } else if (e.key === "ArrowDown" && from === el.value.length && to === from && i < cur.length - 1) {
      e.preventDefault()
      focusBlock(cur[i + 1]!.id, "start")
    }
  }

  const onTextChange = (b: ScriptBlock, raw: string) => {
    let type = b.type
    let text = shape(type, raw)
    // Typing INT. or EXT. at the start of an action line makes it a scene heading
    if (type === "action" && !raw.includes("\n") && /^(int|ext)\./i.test(raw)) {
      type = "scene"
      text = raw.toUpperCase()
    }
    const cur = blocksRef.current
    commit(cur.map((x) => (x.id === b.id ? { ...x, type, text } : x)), true)
    setSuggest({ id: b.id, items: suggestionsFor({ ...b, type, text }, cur) })
  }

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>, b: ScriptBlock, i: number) => {
    const text = e.clipboardData.getData("text")
    if (!/\n\s*\n/.test(text)) return
    const parsed = parseFountain(text)
    if (parsed.length < 2) return
    e.preventDefault()
    insertAfter(i, parsed, !b.text.trim())
  }

  // What is on the page and where
  const counts = blockLineCounts(blocks)
  const starts: number[] = []
  counts.reduce((acc, n, i) => {
    starts[i] = acc
    return acc + n
  }, 0)
  const stats = scriptStats(blocks)
  const activeIndex = Math.max(0, indexOf(activeId))
  const currentPage = Math.floor((starts[activeIndex] ?? 0) / LINES_PER_PAGE) + 1
  const activeType = blocks[activeIndex]?.type

  const exportScript = () => download(new Blob([toFountain(blocks)], { type: "text/plain" }), `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "script"}.fountain`)

  const importScript = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    const hasScript = blocks.some((b) => b.text.trim())
    if (hasScript && !(await askYesNo("Replace the script?", `Opening "${file.name}" replaces what is on the page. You can undo it with Ctrl+Z.`))) return
    const next = startBlocks(text)
    commit(next)
    setActiveId(next[0]!.id)
    if (importInput.current) importInput.current.value = ""
  }

  const insertText = (text: string) => {
    const cur = blocksRef.current
    const b = cur.find((x) => x.id === activeId) ?? cur[cur.length - 1]!
    const joined = b.text && !/\s$/.test(b.text) ? `${b.text} ${text}` : `${b.text}${text}`
    commit(cur.map((x) => (x.id === b.id ? { ...x, text: shape(x.type, joined) } : x)))
    focusBlock(b.id, "end")
  }

  const load = (text: string) => {
    const next = startBlocks(text)
    commit(next)
    setActiveId(next[0]!.id)
  }

  const ask = async (request: string): Promise<string> => {
    const text = request.trim()
    if (!onGenerateText) throw new Error("Add a key and switch on a chat model in Settings, Providers, so the agent can write.")
    const cur = blocksRef.current
    const empty = !cur.some((b) => b.text.trim())
    // What the request means: a fresh script, a rewrite of the scene being edited, or more pages after the cursor
    const mode: AgentMode =
      empty || (/\b(whole|entire|everything|from scratch)\b/i.test(text) && /\b(rewrite|redo|write)\b/i.test(text))
        ? "all"
        : /\b(rewrite|rework|revise|fix|polish|tighten|sharper|shorter|longer|punch)/i.test(text)
          ? "scene"
          : "continue"
    const at = Math.max(0, cur.findIndex((b) => b.id === activeId))
    let from = 0
    let to = cur.length
    let scope = ""
    if (mode === "continue") {
      from = at + 1
      to = at + 1
      scope = `Continue the screenplay from where it stops below. Write only the new pages.\n\nThe script so far (end):\n${toFountain(cur.slice(0, at + 1)).slice(-4000)}`
    } else if (mode === "scene") {
      const start = (() => {
        for (let k = at; k >= 0; k--) if (cur[k]!.type === "scene") return k
        return 0
      })()
      const stop = (() => {
        for (let k = at + 1; k < cur.length; k++) if (cur[k]!.type === "scene") return k
        return cur.length
      })()
      from = start
      to = stop
      scope = `Rewrite only this scene and return the whole scene, starting with its heading.\n\nThe scene:\n${toFountain(cur.slice(start, stop))}\n\nThe script around it, for continuity:\n${toFountain(cur).slice(0, 6000)}`
    } else {
      scope = empty ? "Write the screenplay from the premise." : `Rewrite the whole screenplay.\n\nThe current script:\n${toFountain(cur).slice(0, 12000)}`
    }
    const prompt = [
      "You are a professional screenwriter. Write in Fountain format (fountain.io): scene headings start with INT. or EXT. in capitals with a place and time, such as INT. WAREHOUSE - NIGHT; action is plain text; a character name is in capitals on its own line with the dialogue directly under it; a parenthetical is in round brackets on its own line under the name; a transition is in capitals ending with TO:. Put one blank line between elements. Keep action short and visual: only what can be seen and heard. Reply with the screenplay text only: no commentary, no markdown, no code fences.",
      `Story: ${title}.${logline ? ` Premise: ${logline}` : ""}`,
      scope,
      `What to do: ${text}`,
    ].join("\n\n")
    const reply = await onGenerateText(prompt)
    const written = parseFountain(stripFences(reply))
    if (written.length === 0) throw new Error("The agent did not return any script.")
    const next = [...cur.slice(0, from), ...written, ...cur.slice(to)]
    commit(next.length ? next : [makeBlock("action")])
    focusBlock(written[written.length - 1]!.id, "end")
    return mode === "continue" ? `Wrote ${written.length} more lines after the cursor. Ctrl+Z undoes it.` : mode === "scene" ? `Rewrote the scene (${written.length} lines). Ctrl+Z undoes it.` : `Wrote the script (${written.length} lines). Ctrl+Z undoes it.`
  }
  React.useImperativeHandle(handle, () => ({ ask, insertText, load }))

  return (
    <div className="group/script relative flex min-h-0 flex-1 flex-col">
      <Input ref={importInput} type="file" accept=".fountain,.txt,text/plain" className="hidden" aria-label="Upload a script file" onChange={(e) => void importScript(e.target.files?.[0])} />

      {/* The kind of line, for those who write the format by hand */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b border-border/40 bg-background/30 px-4 py-1.5">
        <div className="flex items-center rounded-lg border border-border/70 bg-secondary/40 p-0.5" role="group" aria-label="Kind of line">
          {ELEMENTS.map((el) => (
            <Button
              key={el.type}
              type="button"
              variant="ghost"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => changeType(activeId, el.type)}
              aria-pressed={activeType === el.type}
              className={cn("h-6 rounded-md px-2 text-xs", activeType === el.type ? "bg-card font-semibold text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
            >
              {el.label}
            </Button>
          ))}
        </div>
        {[
          { label: "Undo (Ctrl+Z)", icon: <Undo2 className="h-3.5 w-3.5" />, run: undo },
          { label: "Redo (Ctrl+Y)", icon: <Redo2 className="h-3.5 w-3.5" />, run: redo },
        ].map((a) => (
          <Tooltip key={a.label}>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onMouseDown={(e) => e.preventDefault()} onClick={a.run} aria-label={a.label} className="h-7 w-7 text-muted-foreground">
                {a.icon}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{a.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* The page */}
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto bg-secondary/10 px-6 py-6 no-scrollbar">
        <span ref={ruler} className="script-page invisible absolute whitespace-pre" style={{ width: "85ch" }} aria-hidden="true" />
        <div className="mx-auto" style={{ width: `${85 * zoom}ch` }}>
          <div
            className="script-page relative rounded-sm border border-border/60 bg-card text-foreground shadow-md"
            style={{ width: "85ch", zoom, padding: "6ch 10ch 8ch 15ch" }}
          >
            {blocks.map((b, i) => {
              const col = COLUMNS[b.type]
              const page = Math.floor((starts[i] ?? 0) / LINES_PER_PAGE) + 1
              const prevPage = i > 0 ? Math.floor((starts[i - 1] ?? 0) / LINES_PER_PAGE) + 1 : 1
              const joins = (b.type === "dialogue" || b.type === "parenthetical") && i > 0
              const options = suggest && suggest.id === b.id ? suggest.items : []
              return (
                <React.Fragment key={b.id}>
                  {page > prevPage && counts[i]! > 0 && (
                    <div className="relative my-3 border-t border-dashed border-border/60" style={{ marginLeft: "-15ch", marginRight: "-10ch" }} aria-hidden="true">
                      <span className="absolute -top-2 right-3 bg-card px-1 font-sans text-xs text-muted-foreground">{page}.</span>
                    </div>
                  )}
                  <div className={cn("group relative", b.type === "parenthetical" && "flex items-start")} style={{ marginLeft: `${col.indent}ch`, width: `${col.width}ch`, marginTop: i === 0 || joins ? 0 : "1.25em" }}>
                    {b.type === "parenthetical" && <span aria-hidden="true">(</span>}
                    <span className="pointer-events-none absolute right-full top-0 mr-2 hidden whitespace-nowrap font-sans text-xs text-muted-foreground group-focus-within:block">{BLOCK_LABEL[b.type]}</span>
                    <Textarea
                      ref={(el) => {
                        if (el) fields.current.set(b.id, el)
                        else fields.current.delete(b.id)
                      }}
                      value={b.text}
                      rows={1}
                      spellCheck={b.type !== "character" && b.type !== "scene"}
                      aria-label={BLOCK_LABEL[b.type]}
                      placeholder={blocks.length === 1 && !b.text ? "Start with a scene heading such as INT. LOCATION - DAY, or press Tab to change what this line is." : PLACEHOLDER[b.type]}
                      onFocus={() => {
                        setActiveId(b.id)
                        setSuggest({ id: b.id, items: suggestionsFor(b, blocksRef.current) })
                      }}
                      onBlur={() => window.setTimeout(() => setSuggest((s) => (s && s.id === b.id ? null : s)), 120)}
                      onChange={(e) => onTextChange(b, e.target.value)}
                      onKeyDown={(e) => onKeyDown(e, b, i)}
                      onPaste={(e) => onPaste(e, b, i)}
                      className={cn(
                        "block w-full text-foreground placeholder:text-muted-foreground/40 focus-visible:outline-none",
                        b.type === "scene" && "font-bold",
                        b.type === "parenthetical" && "w-auto min-w-[1ch] max-w-[18ch] [field-sizing:content]",
                        b.type === "transition" && "text-right",
                        b.type === "act" && "font-bold text-muted-foreground",
                        b.type === "note" && "italic text-muted-foreground",
                      )}
                    />
                    {b.type === "parenthetical" && <span aria-hidden="true">)</span>}
                    {options.length > 0 && (
                      <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-border bg-popover p-1 font-sans shadow-lg">
                        {options.map((o) => (
                          <Button
                            key={o}
                            type="button"
                            variant="ghost"
                            size="sm"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setText(b.id, shape(b.type, o))
                              setSuggest(null)
                              focusBlock(b.id, "end")
                            }}
                            className="h-7 w-full justify-start px-2 font-mono text-xs"
                          >
                            {o}
                          </Button>
                        ))}
                        {b.text && <p className="px-2 pt-1 text-xs text-muted-foreground">Tab to accept</p>}
                      </div>
                    )}
                  </div>
                </React.Fragment>
              )
            })}
          </div>
        </div>
      </div>

      <ScriptRail
        full={full}
        onToggleFull={onToggleFull}
        onDownload={exportScript}
        onUpload={() => importInput.current?.click()}
        onBreak={() => onBreakIntoScenes(scenesOf(blocks))}
        breakNote=""
      />
      <ScriptBottomBar
        settings={settings}
        onText={insertText}
        hint="Return: next line · Tab: change this line"
        info={
          <>
            <span>
              Page {currentPage} of {stats.pages}
            </span>
            <span>about {stats.minutes} min</span>
            <span>{stats.words} words</span>
          </>
        }
      />
    </div>
  )
})
