import * as React from "react"
import { ArrowLeft, Check, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { cutToolsFor, toolsFor } from "@/lib/ai-tools/match"
import type { ToolOffer } from "@/lib/ai-tools/match"
import { choicesFor, optionsFor, paramsFor, priceOf, runTool } from "@/lib/ai-tools/run"
import type { ToolMedia } from "@/lib/ai-tools/run"
import type { MediaKind, Surface, ToolOption } from "@/lib/ai-tools/types"
import type { ModelRecord } from "@/lib/registry/types"
import { formatPriceShort } from "@/lib/registry/types"
import type { MediaAsset, SettingsState } from "@/types"
import { useBookmarks } from "@/lib/registry/bookmarks"
import { iconOf } from "./tool-icons"
import { useToolContext } from "./use-tool-context"

/**
 * The AI tools for one piece of media, in one place. Story/Edit, Create and the Library all show this same panel; what differs is only where
 * a finished result goes (`onDone`) and whether picture tools and whole-cut jobs are offered (`surface`).
 */

export interface AiToolPanelProps {
  media: ToolMedia | null
  /** The kind of media when nothing is selected yet (a cut tool still works) */
  kind: MediaKind
  surface: Surface
  settings: SettingsState
  projectId?: string
  /** A voice or a picture the place can offer, for tools that need a second file (lip-sync, motion transfer) */
  audioUrl?: string
  imageUrl?: string
  /** A tool that works on the whole cut was clicked (Story/Edit runs it with its agent) */
  onCutTool?: (offer: ToolOffer) => Promise<string | void>
  /** A model tool finished: the new media */
  onDone: (assets: MediaAsset[], offer: ToolOffer) => void
  onOpenSettings?: () => void
  className?: string
  /** Why there is nothing to work on when something is selected, for example a beat with no video yet */
  noMedia?: string
  /** Filters the cards by name */
  query?: string
}

const usd = (n: number | null) => (n === null ? "price unknown" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`)

function OptionField({ option, record, value, onChange }: { option: ToolOption; record: ModelRecord; value: string | number | boolean | undefined; onChange: (v: string | number | boolean) => void }) {
  const choices = choicesFor(option, record)
  const shown = value ?? option.default ?? choices[0]?.value ?? ""
  if (option.type === "choice") {
    return (
      <label className="block space-y-1 text-xs text-muted-foreground">
        {option.label}
        <Select value={String(shown)} onValueChange={(v) => onChange(choices.find((c) => String(c.value) === v)?.value ?? v)}>
          <SelectTrigger aria-label={option.label} className="h-8 rounded-md bg-secondary px-2 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choices.map((c) => (
              <SelectItem key={String(c.value)} value={String(c.value)} className="text-xs">
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
    )
  }
  return (
    <label className="block space-y-1 text-xs text-muted-foreground">
      {option.label}
      <Input
        type={option.type === "number" ? "number" : "text"}
        min={option.min}
        max={option.max}
        step={option.step}
        value={String(shown)}
        onChange={(e) => onChange(option.type === "number" ? Number(e.target.value) : e.target.value)}
        aria-label={option.label}
        className="h-8 text-xs"
      />
      {option.hint && <span className="block text-xs text-muted-foreground">{option.hint}</span>}
    </label>
  )
}

export function AiToolPanel({ media, kind, surface, settings, projectId, audioUrl, imageUrl, onCutTool, onDone, onOpenSettings, className, query, noMedia }: AiToolPanelProps) {
  const ctx = useToolContext(settings)
  const [open, setOpen] = React.useState<ToolOffer | null>(null)
  const [modelId, setModelId] = React.useState<string>("")
  const [prompt, setPrompt] = React.useState("")
  const [options, setOptions] = React.useState<Record<string, string | number | boolean>>({})
  const [running, setRunning] = React.useState(false)
  const [message, setMessage] = React.useState<{ kind: "error" | "done"; text: string } | null>(null)
  const [cutBusy, setCutBusy] = React.useState<string | null>(null)
  const [cutNote, setCutNote] = React.useState("")
  const abort = React.useRef<AbortController | null>(null)

  // Story/Edit and the agent show Cut, Video and Audio apart; Create and Library show the tools of the file that is open
  const cuts = React.useMemo(() => cutToolsFor(surface), [surface])
  const tabbed = cuts.length > 0
  const [tab, setTab] = React.useState<"cut" | "video" | "audio">(media?.kind === "audio" ? "audio" : "video")
  React.useEffect(() => {
    if (media?.kind === "audio") setTab("audio")
    else if (media?.kind === "video" || media?.kind === "image") setTab("video")
  }, [media?.kind])
  const shownKind: MediaKind = tabbed ? (tab === "audio" ? "audio" : "video") : (media?.kind ?? kind)
  const offers = React.useMemo(() => toolsFor({ kind: shownKind, surface }, ctx), [shownKind, surface, ctx])

  const marked = useBookmarks()
  const [showAll, setShowAll] = React.useState(false)
  // The models for the open tool: bookmarked first, then the rest; Show all adds every model that takes this kind of file
  const choices = React.useMemo(() => {
    if (!open) return []
    const pool = showAll ? [...open.candidates, ...open.more] : open.candidates
    return [...pool.filter((r) => marked.has(r.id)), ...pool.filter((r) => !marked.has(r.id))]
  }, [open, showAll, marked])
  const record = choices.find((r) => r.id === modelId) ?? choices[0]
  const price = record && media && open ? priceOf(record, paramsFor(open.spec, record, options).params, media) : null

  const start = (offer: ToolOffer) => {
    setOpen(offer)
    setShowAll(false)
    // The model used last time for this tool, when it is still there; otherwise a bookmarked one, otherwise the first
    let last: string | null = null
    try {
      last = localStorage.getItem(`gencraft_tool_model_${offer.spec.id}`)
    } catch {
      last = null
    }
    const first = offer.candidates.find((r) => r.id === last) ?? offer.candidates.find((r) => marked.has(r.id)) ?? offer.candidates[0]
    setModelId(first?.id ?? "")
    setPrompt("")
    setOptions({})
    setMessage(null)
  }

  const run = async () => {
    if (!open || !record || !media) return
    setRunning(true)
    setMessage(null)
    const controller = new AbortController()
    abort.current = controller
    try {
      const result = await runTool(open.spec, record, { media, prompt, options, audioUrl, imageUrl }, { settings, projectId, signal: controller.signal })
      if (controller.signal.aborted) return
      onDone(result.assets, open)
      setMessage({ kind: "done", text: `Done for ${usd(result.costUsd)}.` })
    } catch (e) {
      if (!controller.signal.aborted) setMessage({ kind: "error", text: e instanceof Error ? e.message : String(e) })
    } finally {
      setRunning(false)
    }
  }

  const runCut = async (offer: ToolOffer) => {
    if (!onCutTool) return
    setCutBusy(offer.spec.id)
    setCutNote("")
    try {
      setCutNote((await onCutTool(offer)) ?? "")
    } catch (e) {
      setCutNote(e instanceof Error ? e.message : String(e))
    } finally {
      setCutBusy(null)
    }
  }

  // ---- one tool open: its model, words, options and price
  if (open && record) {
    const needs = open.spec.needs ?? []
    const missing = needs.find((n) => n.required && (n.kind === "audio" ? !audioUrl : !imageUrl))
    const fields = optionsFor(open.spec, record)
    return (
      <div className={cn("space-y-3", className)}>
        <Button type="button" variant="ghost" size="sm" onClick={() => { abort.current?.abort(); setOpen(null) }} className="h-7 gap-1 px-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          All tools
        </Button>
        <div>
          <div className="text-xs font-semibold text-foreground" title={open.spec.hint}>{open.spec.name}</div>
        </div>
        {(choices.length > 1 || open.more.length > 0) && (
          <label className="block space-y-1 text-xs text-muted-foreground">
            Model
            <Select
              value={record.id}
              onValueChange={(id) => {
                setModelId(id)
                try {
                  localStorage.setItem(`gencraft_tool_model_${open.spec.id}`, id)
                } catch {
                  // storage unavailable: the choice lasts until the panel closes
                }
              }}
            >
              <SelectTrigger aria-label="Model" className="h-8 rounded-md bg-secondary px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {choices.map((r, i) => (
                  <React.Fragment key={r.id}>
                    {marked.has(choices[0]!.id) && i === choices.filter((c) => marked.has(c.id)).length && <div className="px-2 pb-1 pt-1.5 text-xs font-semibold text-muted-foreground">More</div>}
                    <SelectItem value={r.id} className="text-xs">
                      {marked.has(r.id) ? "★ " : ""}
                      {r.name} · {formatPriceShort(r.price)}
                    </SelectItem>
                  </React.Fragment>
                ))}
              </SelectContent>
            </Select>
            {open.more.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)} className="h-6 px-1 text-xs text-muted-foreground">
                {showAll ? "Show fewer" : `Show all (${open.more.length} more)`}
              </Button>
            )}
          </label>
        )}
        {choices.length === 1 && open.more.length === 0 && <p className="truncate text-xs text-muted-foreground">{record.name}</p>}
        {open.spec.prompt && (
          <label className="block space-y-1 text-xs text-muted-foreground">
            {open.spec.prompt.label}
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} placeholder={open.spec.prompt.placeholder} aria-label={open.spec.prompt.label} className="resize-none text-xs" />
          </label>
        )}
        {fields.map((o) => (
          <OptionField key={o.id} option={o} record={record} value={options[o.id]} onChange={(v) => setOptions((prev) => ({ ...prev, [o.id]: v }))} />
        ))}
        {missing && <p className="rounded-md bg-secondary p-2 text-xs text-muted-foreground">This tool needs a {missing.label.toLowerCase()}, and none is chosen here.</p>}
        <p className="text-xs text-muted-foreground">
          {media ? (price === null ? "The price is not known for this model." : `About ${usd(price)}${media.seconds ? ` for ${Math.round(media.seconds)} s` : ""}.`) : "Choose something to work on first."}
        </p>
        {message && (
          <p className={cn("rounded-md p-2 text-xs", message.kind === "error" ? "bg-destructive/10 text-destructive" : "bg-secondary text-foreground")}>
            {message.kind === "done" && <Check className="mr-1 inline h-3 w-3" />}
            {message.text}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={running || !media || Boolean(missing) || (open.spec.prompt?.required === true && prompt.trim() === "")} onClick={() => void run()} className="h-8 flex-1 gap-1.5 text-xs">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {running ? "Working..." : `Run ${open.spec.name}`}
          </Button>
          {running && (
            <Button type="button" variant="ghost" size="sm" onClick={() => { abort.current?.abort(); setRunning(false) }} className="h-8 text-xs">
              Stop
            </Button>
          )}
        </div>
      </div>
    )
  }

  // ---- the list: one card per tool, a tool nothing can run yet stays in the grid, dimmed, with what to add
  const q = (query ?? "").trim().toLowerCase()
  const matches = (o: ToolOffer) => q === "" || [o.spec.name, ...(o.spec.also ?? [])].some((n) => n.toLowerCase().includes(q))
  const card = (o: ToolOffer, onClick: () => void, busy = false) => {
    const Icon = iconOf(o.spec.id)
    const isReady = o.status.state === "ready"
    const cost = isReady && media && o.candidates[0] ? priceOf(o.candidates[0], paramsFor(o.spec, o.candidates[0]).params, media) : null
    const why = isReady ? o.spec.hint : "reason" in o.status ? `${o.spec.hint} ${o.status.reason}` : o.spec.hint
    const locked = !isReady || (o.spec.kind !== "cut" && media?.kind !== o.spec.group)
    return (
      <Button
        key={o.spec.id}
        type="button"
        variant="ghost"
        title={why}
        aria-label={o.spec.name}
        disabled={(cutBusy !== null && o.spec.kind === "cut") || (isReady && o.spec.kind !== "cut" && media?.kind !== o.spec.group)}
        onClick={() => (isReady ? onClick() : onOpenSettings?.())}
        className={cn("h-auto min-w-0 flex-col gap-1 rounded-lg border border-border/60 bg-secondary/40 px-1.5 py-2 text-xs font-normal hover:bg-secondary", locked && "opacity-50")}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4 text-muted-foreground" />}
        <span className="line-clamp-2 w-full break-words text-center leading-tight text-foreground">{o.spec.name}</span>
        <span className="h-4 font-mono text-xs text-muted-foreground">{!isReady ? (o.status.state === "needs-model" && o.status.missing === "model" ? "No model" : "Add key") : o.spec.kind === "cut" ? "Free" : media?.kind !== o.spec.group ? (noMedia ? "No video yet" : o.spec.group === "audio" ? "Select a sound" : "Select a clip") : cost === null ? "" : usd(cost)}</span>
      </Button>
    )
  }
  const group = (title: string, items: React.ReactNode[]) =>
    items.length > 0 && (
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-foreground">{title}</div>
        <div className="grid grid-cols-2 gap-1.5">{items}</div>
      </div>
    )
  const label = shownKind === "audio" ? "Sound" : shownKind === "video" ? "Video" : "Picture"
  const forMedia = media?.kind === shownKind
  return (
    <div className={cn("space-y-3", className)}>
      {tabbed && (
        <div className="grid grid-cols-3 gap-0.5 rounded-md bg-secondary p-0.5" role="tablist">
          {([["video", "Video"], ["audio", "Audio"], ["cut", "Cut"]] as const).map(([id, name]) => (
            <Button key={id} type="button" role="tab" aria-selected={tab === id} variant="ghost" size="sm" onClick={() => setTab(id)} className={cn("h-7 rounded-sm text-xs", tab === id ? "bg-card text-foreground" : "text-muted-foreground")}>
              {name}
            </Button>
          ))}
        </div>
      )}
      {tabbed && tab === "cut" ? (
        <>
          {group("On the whole cut", cuts.filter(matches).map((o) => card(o, () => void runCut(o), cutBusy === o.spec.id)))}
          {cutNote && <p className="whitespace-pre-wrap rounded-md bg-secondary p-2 text-xs text-foreground">{cutNote}</p>}
        </>
      ) : (
        <>
          {group(forMedia ? `${label}: ${media!.name}` : label, offers.filter(matches).map((o) => card(o, () => start(o))))}
          {!forMedia && <p className="text-xs text-muted-foreground">{noMedia ?? `Select a ${shownKind === "audio" ? "sound" : shownKind === "video" ? "clip" : "picture"} first.`}</p>}
        </>
      )}
    </div>
  )
}
