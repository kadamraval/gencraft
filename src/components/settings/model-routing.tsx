import * as React from "react"
import { FilterBadge } from "@/components/ui/filter-badge"
import { Wand2, Image as ImageIcon, ImagePlus, Video, Clapperboard, Mic, Music, AudioLines, X, ChevronsLeft, ChevronDown, Search, SlidersHorizontal, Trash2, AlertTriangle, Plus, Star, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ModelLogo } from "@/components/ui/model-logo"
import { PriceCell } from "@/components/ui/price-cell"
import { SchemaForm, defaultsFor, isEditable } from "@/components/composer/schema-form"
import { useToolContext } from "@/components/ai-tools/use-tool-context"
import { CATALOG } from "@/lib/ai-tools/catalog"
import { statusOf } from "@/lib/ai-tools/match"
import { useBookmarks } from "@/lib/registry/bookmarks"
import { groupModelFor, groupModelForTool, resolveGroups, tierOfGroup } from "@/lib/registry/groups"
import type { ExtraRole } from "@/lib/registry/groups"
import { makerRank } from "@/lib/registry/logo-rules"
import { hasRole, ROLE_LABEL } from "@/lib/registry/roles"
import type { Role } from "@/lib/registry/roles"
import { useListedModels, useRegistry } from "@/lib/registry/store"
import { defaultModelFor } from "@/lib/registry/enabled"
import { rowInfo } from "@/lib/registry/summary"
import type { GroupModality, ModelGroup, SettingsState } from "@/types"
import type { ModelRecord } from "@/lib/registry/types"
import { cn } from "@/lib/utils"

interface Props {
  settings: SettingsState
  onChange: (settings: SettingsState) => void
}

/** A searchable list of the models that can do a job: bookmarked first, then a divider, then the rest. */
function ModelPick({ pool, onPick, label, children }: { pool: ModelRecord[]; onPick: (id: string) => void; label: string; children: React.ReactNode }) {
  const marked = useBookmarks()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  const { starred, rest } = React.useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const rows = pool
      .filter((m) => tokens.every((t) => `${m.name} ${m.endpoint} ${m.maker ?? ""}`.toLowerCase().includes(t)))
      .sort(
        (a, b) =>
          makerRank({ name: a.name, endpoint: a.endpoint, family: a.family }, a.modality) - makerRank({ name: b.name, endpoint: b.endpoint, family: b.family }, b.modality) ||
          a.name.localeCompare(b.name),
      )
    return { starred: rows.filter((m) => marked.has(m.id)), rest: rows.filter((m) => !marked.has(m.id)) }
  }, [pool, query, marked])

  const row = (m: ModelRecord) => {
    const info = rowInfo(m)
    return (
      <Button
        key={m.id}
        type="button"
        variant="ghost"
        onClick={() => {
          onPick(m.id)
          setOpen(false)
        }}
        className="h-auto w-full justify-between gap-2 px-2 py-1.5"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ModelLogo name={m.name} endpoint={m.endpoint} family={m.family} provider={m.provider} size={16} />
          <span className="w-20 flex-shrink-0 truncate text-left text-xs text-muted-foreground">{m.maker}</span>
          <span className="min-w-0 text-left">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-xs font-medium text-foreground">{m.name}</span>
              <FilterBadge model={m} />
            </span>
            {info && <span className="block truncate text-xs text-muted-foreground">{info}</span>}
          </span>
        </span>
        <PriceCell price={m.price} modality={m.modality} model={m} />
      </Button>
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setQuery("")
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-96 space-y-2 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${label.toLowerCase()} models`} className="h-8 pl-8 text-xs" />
        </div>
        <div className="max-h-64 space-y-0.5 overflow-y-auto no-scrollbar">
          {starred.length + rest.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No models can do this yet. Add a key or a model in Providers.</p>}
          {starred.map(row)}
          {starred.length > 0 && rest.length > 0 && <div className="px-2 pb-1 pt-2 text-xs font-semibold text-muted-foreground">More</div>}
          {rest.slice(0, 60).map(row)}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Chip({ model, id, first, onRemove, onMakeFirst }: { model?: ModelRecord; id: string; first: boolean; onRemove: () => void; onMakeFirst?: () => void }) {
  return (
    <div className={cn("inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium", first ? "border-border bg-card text-foreground" : "border-border/50 bg-secondary/70 text-foreground")}>
      {model ? (
        <ModelLogo name={model.name} endpoint={model.endpoint} family={model.family} provider={model.provider} size={14} />
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </TooltipTrigger>
          <TooltipContent>This model is retired or no longer offered. Remove it.</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="max-w-32 truncate">{model?.name ?? id}</span>
        </TooltipTrigger>
        <TooltipContent>{first ? "Used first. If it fails, the next one runs." : "Fallback, used if the ones before it fail."}</TooltipContent>
      </Tooltip>
      {!first && onMakeFirst && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="iconSm" aria-label="Use first" onClick={onMakeFirst} className="h-4 w-4 p-0">
              <ChevronsLeft className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Use this one first</TooltipContent>
        </Tooltip>
      )}
      <Button type="button" variant="ghost" size="iconSm" aria-label="Remove" onClick={onRemove} className="h-4 w-4 p-0 hover:text-destructive">
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}

/** The rows of the level table. Four are stored the way they always were; the rest are new and stored apart. */
const TABLE: Array<{ role: Role; icon: React.ElementType; legacy?: GroupModality }> = [
  { role: "text", icon: Wand2, legacy: "text" },
  { role: "image", icon: ImageIcon, legacy: "image" },
  { role: "image-edit", icon: ImagePlus },
  { role: "video", icon: Video, legacy: "video" },
  { role: "video-edit", icon: Clapperboard },
  { role: "speech", icon: Mic },
  { role: "music", icon: Music, legacy: "audio" },
  { role: "stt", icon: AudioLines },
]

const LEVELS = ["low", "medium", "high"]

/**
 * Chat and the agent's own model, and the three levels the agent works at. Nothing here needs setting: every row follows its level by
 * itself (Low the cheapest model that does the job, High the best) and picks up a new model as soon as one is fetched. A row set by hand
 * keeps your choice until you reset it.
 */
export function ModelsSection({ settings, onChange }: Props) {
  const all = useRegistry()
  const listed = useListedModels()
  const toolCtx = useToolContext(settings)
  const marked = useBookmarks()
  const byId = React.useMemo(() => new Map(all.map((m) => [m.id, m])), [all])
  const raw: ModelGroup[] = React.useMemo(() => settings.aiEngine.groups ?? LEVELS.map((id) => ({ id, name: id[0]!.toUpperCase() + id.slice(1), models: {} })), [settings.aiEngine.groups])
  const resolved = React.useMemo(() => resolveGroups(raw, listed), [raw, listed])
  const [groupId, setGroupId] = React.useState<string>(settings.aiEngine.activeGroupId ?? "medium")
  const rawGroup = raw.find((g) => g.id === groupId) ?? raw[0]
  const group = resolved.find((g) => g.id === rawGroup?.id) ?? resolved[0]
  const [toolsOpen, setToolsOpen] = React.useState(false)

  const chat = settings.aiEngine.activeTextModelId
  const chatChain = [...new Set([chat, ...(settings.aiEngine.fallbackModels?.text ?? [])].filter((id): id is string => Boolean(id)))]
  const setChatChain = (chain: string[]) =>
    onChange({ ...settings, aiEngine: { ...settings.aiEngine, activeTextModelId: chain[0] ?? "", fallbackModels: { ...(settings.aiEngine.fallbackModels ?? {}), text: chain.slice(1) } } })

  const saveGroups = (next: ModelGroup[], active = groupId) => onChange({ ...settings, aiEngine: { ...settings.aiEngine, groups: next, activeGroupId: active } })
  const updateRaw = (patch: (g: ModelGroup) => ModelGroup) => {
    if (!rawGroup) return
    saveGroups(raw.map((g) => (g.id === rawGroup.id ? patch(g) : g)))
  }
  const addGroup = () => {
    const id = `group-${Date.now()}`
    saveGroups([...raw, { id, name: `Group ${raw.length + 1}`, models: {} }], id)
    setGroupId(id)
  }
  const removeGroup = () => {
    if (!rawGroup || LEVELS.includes(rawGroup.id) || raw.length <= 1) return
    const next = raw.filter((g) => g.id !== rawGroup.id)
    saveGroups(next, next[0]!.id)
    setGroupId(next[0]!.id)
  }

  const poolFor = (role: Role) => listed.filter((m) => (role === "music" ? hasRole(m, "music") || hasRole(m, "speech") : hasRole(m, role)))
  const toolsList = React.useMemo(() => CATALOG.filter((t) => t.kind === "model" && t.group !== "image").map((spec) => ({ spec, ...statusOf(spec, toolCtx) })), [toolCtx])

  const setRole = (row: (typeof TABLE)[number], id: string | null) =>
    updateRaw((g) => {
      if (row.legacy) {
        const models = { ...g.models }
        if (id) models[row.legacy] = { ...(models[row.legacy] ?? {}), modelId: id }
        else delete models[row.legacy]
        return { ...g, models }
      }
      const extra = { ...(g.extra ?? {}) }
      if (id) extra[row.role as ExtraRole] = id
      else delete extra[row.role as ExtraRole]
      return { ...g, extra }
    })

  const setTool = (toolId: string, id: string | null) =>
    updateRaw((g) => {
      const tools = { ...(g.tools ?? {}) }
      if (id) tools[toolId] = id
      else delete tools[toolId]
      return { ...g, tools }
    })

  return (
    <div className="space-y-4">
      {!listed.some((m) => m.modality === "text") && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">No chat model yet.</span> Chat and the agent need one. Add a key for OpenRouter, Google Gemini, OpenAI or Replicate in Providers.
          </p>
        </div>
      )}

      {/* Chat: the model chat uses, with fallbacks */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary px-3 py-2">
        <div className="flex w-28 flex-shrink-0 items-center gap-2">
          <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-bold text-foreground">Chat</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {chatChain.length === 0 &&
            (() => {
              const fallback = defaultModelFor("text", listed)
              return fallback ? (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-dashed border-border/60 px-2 text-xs text-muted-foreground">
                  <ModelLogo name={fallback.name} endpoint={fallback.endpoint} family={fallback.family} provider={fallback.provider} size={14} />
                  <span className="max-w-32 truncate">{fallback.name}</span>
                  <span>Auto</span>
                </span>
              ) : null
            })()}
          {chatChain.map((id, i) => (
            <Chip key={id} id={id} model={byId.get(id)} first={i === 0} onRemove={() => setChatChain(chatChain.filter((c) => c !== id))} onMakeFirst={() => setChatChain([id, ...chatChain.filter((c) => c !== id)])} />
          ))}
          <ModelPick pool={listed.filter((m) => hasRole(m, "text") && !chatChain.includes(m.id))} label="chat" onPick={(id) => setChatChain([...chatChain, id])}>
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1 border-dashed text-muted-foreground">
              <Plus className="h-3 w-3" />
              {chatChain.length === 0 ? "Choose" : "Add"}
            </Button>
          </ModelPick>
        </div>
      </div>

      {/* The agent's levels */}
      <div className="space-y-2 rounded-xl border border-border bg-secondary p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {raw.map((g) => (
            <Button key={g.id} type="button" size="sm" variant={g.id === rawGroup?.id ? "secondary" : "ghost"} onClick={() => setGroupId(g.id)}>
              {g.name}
            </Button>
          ))}
          <Button type="button" size="sm" variant="outline" className="gap-1 border-dashed" onClick={addGroup}>
            <Plus className="h-3 w-3" />
            New
          </Button>
          {rawGroup && !LEVELS.includes(rawGroup.id) && (
            <Button type="button" variant="ghost" size="icon" aria-label="Delete group" onClick={removeGroup}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {rawGroup && group && (
          <div className="space-y-1.5">
            {!LEVELS.includes(rawGroup.id) && <Input value={rawGroup.name} onChange={(e) => updateRaw((g) => ({ ...g, name: e.target.value }))} className="h-8 w-48 text-xs" aria-label="Group name" />}
            {TABLE.map((row) => {
              const pinnedId = row.legacy ? rawGroup.models[row.legacy]?.modelId : rawGroup.extra?.[row.role as ExtraRole]
              const rec = row.legacy ? byId.get(group.models[row.legacy]?.modelId ?? "") : groupModelFor(group, row.role as ExtraRole, listed, marked)
              const entry = row.legacy ? group.models[row.legacy] : undefined
              const optionKeys = rec && row.legacy ? Object.keys(rec.params.properties).filter((k) => isEditable(rec.params.properties[k]!) && rec.params.properties[k]!.tier !== "advanced" && rec.params.properties[k]!.tier !== "technical") : []
              const values = { ...(rec ? defaultsFor(rec.params) : {}), ...(entry?.params ?? {}) }
              const pool = poolFor(row.role)
              return (
                <div key={row.role} className="flex items-center gap-2">
                  <span className="flex w-32 flex-shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <row.icon className="h-3.5 w-3.5" />
                    {row.role === "text" ? "Chat & Agent" : ROLE_LABEL[row.role]}
                  </span>
                  <ModelPick pool={pool} label={ROLE_LABEL[row.role]} onPick={(id) => setRole(row, id)}>
                    <Button type="button" variant="outline" size="sm" className={cn("h-7 min-w-0 max-w-64 flex-1 justify-start gap-2", !rec && "border-destructive/50 text-destructive")}>
                      {rec ? <ModelLogo name={rec.name} endpoint={rec.endpoint} family={rec.family} provider={rec.provider} size={14} /> : null}
                      <span className="truncate">{rec?.name ?? `No ${ROLE_LABEL[row.role].toLowerCase()} model. Add a key or a model.`}</span>
                      {rec && <FilterBadge model={rec} />}
                    </Button>
                  </ModelPick>
                  <span className="w-10 flex-shrink-0 text-xs text-muted-foreground">{pinnedId ? "" : rec ? "Auto" : ""}</span>
                  {rec && optionKeys.length > 0 && (
                    <Popover>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <PopoverTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" aria-label="Default options">
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </PopoverTrigger>
                        </TooltipTrigger>
                        <TooltipContent>Default options for this model</TooltipContent>
                      </Tooltip>
                      <PopoverContent align="end" className="max-h-80 w-64 overflow-y-auto">
                        <SchemaForm
                          schema={rec.params}
                          values={values}
                          only={optionKeys}
                          onChange={(key, value) => updateRaw((g) => ({ ...g, models: { ...g.models, [row.legacy!]: { modelId: rec.id, params: { ...(g.models[row.legacy!]?.params ?? {}), [key]: value } } } }))}
                        />
                      </PopoverContent>
                    </Popover>
                  )}
                  {pinnedId && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" aria-label="Back to automatic" onClick={() => setRole(row, null)}>
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Back to automatic</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )
            })}

            {/* Tools: one model each, normally automatic */}
            <Button type="button" variant="ghost" size="sm" onClick={() => setToolsOpen((v) => !v)} aria-expanded={toolsOpen} className="h-8 w-full justify-between px-1 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Star className="h-3.5 w-3.5" />
                Tools (remove background, upscale, voice isolation ...)
              </span>
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", toolsOpen && "rotate-180")} />
            </Button>
            {toolsOpen &&
              toolsList.map(({ spec, candidates, status }) => {
                const rec = groupModelForTool(group, spec.id, candidates, marked)
                const pinned = rawGroup.tools?.[spec.id]
                return (
                  <div key={spec.id} className="flex items-center gap-2 pl-5">
                    <span className="w-36 flex-shrink-0 truncate text-xs text-muted-foreground">{spec.name}</span>
                    <ModelPick pool={candidates} label={spec.name} onPick={(id) => setTool(spec.id, id)}>
                      <Button type="button" variant="outline" size="sm" disabled={candidates.length === 0} className={cn("h-7 min-w-0 max-w-64 flex-1 justify-start gap-2", !rec && "border-destructive/50 text-destructive")}>
                        {rec ? <ModelLogo name={rec.name} endpoint={rec.endpoint} family={rec.family} provider={rec.provider} size={14} /> : null}
                        <span className="truncate">{rec?.name ?? (status.state === "needs-model" ? (status.missing === "key" ? "Add a key" : "No model") : "No model")}</span>
                      </Button>
                    </ModelPick>
                    <span className="w-10 flex-shrink-0 text-xs text-muted-foreground">{pinned ? "" : rec ? "Auto" : ""}</span>
                    {pinned && (
                      <Button type="button" variant="ghost" size="icon" aria-label="Back to automatic" onClick={() => setTool(spec.id, null)}>
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )
              })}
            <p className="pt-1 text-xs text-muted-foreground">{tierOfGroup(group) === "low" ? "Low: the cheapest model that does each job." : tierOfGroup(group) === "high" ? "High: the best model for each job." : "Medium: a model in the middle of the price range."}</p>
          </div>
        )}
      </div>
    </div>
  )
}
