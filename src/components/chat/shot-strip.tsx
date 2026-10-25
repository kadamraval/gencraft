import * as React from "react"
import { Minus, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { MentionPopover } from "./mention-popover"
import type { MentionReferenceItem } from "./mention-popover"
import { parseShotRows, serializeShotRows } from "@/lib/models/recipes/shots"
import type { ShotRow } from "@/lib/models/recipes/shots"

/**
 * The prompt while Multi-shot is on: chips 1 2 + (click to choose, drag to reorder), one text box for the chosen shot with its
 * length as a small stepper, and, on the right, the model's own choice for how it cuts shots when it has one. The value is
 * still one string, one shot per line ("4s A knight rides"), so shaping, lint and the request builders read it as they did.
 */

export interface ShotOption {
  label: string
  value: string
  choices: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}

const MAX_SHOTS = 6
const MAX_SECONDS = 30
const MENTION = /(^|\s)@([^\s@]*)$/

export function ShotStrip({
  value,
  onChange,
  withLength,
  totalSeconds,
  option,
  onSubmit,
  mentionItems = [],
  onMention,
}: {
  value: string
  onChange: (value: string) => void
  /** False when the host reads the shots from the prompt itself and a length prefix would be noise */
  withLength: boolean
  /** The clip length chosen in the settings: what shots without a length of their own share */
  totalSeconds?: number
  option?: ShotOption
  onSubmit?: () => void
  /** What @ offers, and what to do when one is chosen (the composer adds it as a reference or element) */
  mentionItems?: MentionReferenceItem[]
  onMention?: (item: MentionReferenceItem) => void
}) {
  const [rows, setRows] = React.useState<ShotRow[]>(() => parseShotRows(value))
  const [at, setAt] = React.useState(0)
  const [dragging, setDragging] = React.useState<number | null>(null)
  const [mention, setMention] = React.useState<string | null>(null)
  const last = React.useRef(value)
  const box = React.useRef<HTMLTextAreaElement>(null)

  // The prompt changed from outside (sent, cleared, reused): start from that
  React.useEffect(() => {
    if (value === last.current) return
    last.current = value
    setRows(parseShotRows(value))
    setAt(0)
  }, [value])

  const index = Math.min(at, rows.length - 1)
  const current = rows[index]!
  const commit = (next: ShotRow[]) => {
    setRows(next)
    const text = serializeShotRows(next, withLength)
    last.current = text
    onChange(text)
  }
  const set = (patch: Partial<ShotRow>) => commit(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  const written = rows.filter((r) => r.text.trim())
  const timed = written.filter((r) => Number(r.seconds) > 0)
  const total = written.length > 0 && timed.length === written.length ? timed.reduce((n, r) => n + Number(r.seconds), 0) : undefined
  const seconds = Number(current.seconds) || 0
  const share = Math.max(1, Math.round((totalSeconds ?? 5) / Math.max(1, rows.length)))

  const move = (from: number, to: number) => {
    if (from === to) return
    const next = [...rows]
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row!)
    setAt(to)
    commit(next)
  }

  return (
    <div className="relative space-y-2 px-0.5 pt-2 animate-in fade-in slide-in-from-bottom-1 duration-150" data-testid="shot-strip">
      <MentionPopover
        isOpen={mention !== null}
        searchQuery={mention ?? ""}
        items={mentionItems}
        onClose={() => setMention(null)}
        onSelect={(item) => {
          const el = box.current
          const caret = el?.selectionStart ?? current.text.length
          const head = current.text.slice(0, caret).replace(MENTION, (_, lead: string) => `${lead}@${item.name} `)
          set({ text: head + current.text.slice(caret) })
          onMention?.(item)
          setMention(null)
          el?.focus()
        }}
      />
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-border/70 px-1.5 py-1">
          {rows.map((_, i) => (
            <Button
              key={i}
              type="button"
              variant="ghost"
              size="iconSm"
              draggable={rows.length > 1}
              aria-label={`Shot ${i + 1}`}
              aria-pressed={i === index}
              onClick={() => setAt(i)}
              onDragStart={() => setDragging(i)}
              onDragOver={(e) => dragging !== null && e.preventDefault()}
              onDrop={() => {
                if (dragging !== null) move(dragging, i)
                setDragging(null)
              }}
              onDragEnd={() => setDragging(null)}
              className={cn("h-6 min-w-6 rounded-full px-1.5 text-xs font-medium", i === index ? "bg-accent text-foreground" : "text-muted-foreground", dragging === i && "opacity-40")}
            >
              {i + 1}
              {i === index && rows.length > 1 && (
                <span
                  role="button"
                  aria-label={`Remove shot ${i + 1}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setAt(Math.max(0, index - 1))
                    commit(rows.filter((_, j) => j !== index))
                  }}
                  className="ml-1 inline-flex"
                >
                  <X className="h-3 w-3" />
                </span>
              )}
            </Button>
          ))}
        </div>
        {rows.length < MAX_SHOTS && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="pill"
                size="chipIcon"
                aria-label="Add shot"
                onClick={() => {
                  const next = [...rows, { text: "", seconds: "" }]
                  setRows(next)
                  setAt(next.length - 1)
                }}
                className="h-7 w-7"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add shot</TooltipContent>
          </Tooltip>
        )}
        {withLength && (
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <div className="inline-flex h-7 items-center rounded-full border border-border/50 bg-secondary/60 text-foreground" role="group" aria-label="Shot length">
              <Button type="button" variant="ghost" size="iconSm" aria-label="Shorter" disabled={seconds === 0} onClick={() => set({ seconds: seconds <= 1 ? "" : String(seconds - 1) })} className="h-7 w-7 rounded-l-full rounded-r-none">
                <Minus className="h-3 w-3" />
              </Button>
              <span className="min-w-9 text-center font-mono">{seconds > 0 ? `${seconds}s` : "Auto"}</span>
              <Button type="button" variant="ghost" size="iconSm" aria-label="Longer" disabled={seconds >= MAX_SECONDS} onClick={() => set({ seconds: String(seconds > 0 ? seconds + 1 : share) })} className="h-7 w-7 rounded-l-none rounded-r-full">
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <span className="min-w-12 text-right font-mono">{total !== undefined ? `${total}s` : "Auto"}</span>
          </div>
        )}
        {option && (
          <Select value={option.value} onValueChange={option.onChange}>
            <SelectTrigger aria-label={option.label} className={cn("h-7 w-auto gap-1 border-0 bg-transparent px-1 text-xs font-medium text-muted-foreground shadow-none", !withLength && "ml-auto")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {option.choices.map((c) => (
                <SelectItem key={c.value} value={c.value} className="text-xs">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <Textarea
        ref={box}
        autoFocus
        rows={2}
        value={current.text}
        onChange={(e) => {
          set({ text: e.target.value })
          const before = e.target.value.slice(0, e.target.selectionStart ?? e.target.value.length)
          const m = MENTION.exec(before)
          setMention(m ? m[2]! : null)
        }}
        onKeyDown={(e) => {
          if (mention !== null) return
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            onSubmit?.()
          }
        }}
        placeholder={`Shot ${index + 1}  ·  @ assets`}
        aria-label={`Shot ${index + 1}`}
        className="min-h-0 w-full resize-none border-0 bg-transparent p-0 text-sm leading-relaxed text-foreground shadow-none outline-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
      />
    </div>
  )
}
