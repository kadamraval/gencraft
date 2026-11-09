import * as React from "react"
import { FilterBadge } from "@/components/ui/filter-badge"
import { Wand2, Image as ImageIcon, Video, AudioLines, Search, SlidersHorizontal, Trash2, AlertTriangle, Plus, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ModelLogo } from "@/components/ui/model-logo"
import { PriceCell } from "@/components/ui/price-cell"
import { SchemaForm, defaultsFor, isEditable } from "@/components/composer/schema-form"
import { useBookmarks } from "@/lib/registry/bookmarks"
import { resolveGroups, tierOfGroup } from "@/lib/registry/groups"
import { makerRank } from "@/lib/registry/logo-rules"
import type { Role } from "@/lib/registry/roles"
import { useListedModels, useRegistry } from "@/lib/registry/store"
import { rowInfo } from "@/lib/registry/summary"
import type { GroupCategory, ModelGroup, SettingsState } from "@/types"
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
          makerRank({ name: a.name, endpoint: a.endpoint, family: a.family }, a.category) - makerRank({ name: b.name, endpoint: b.endpoint, family: b.family }, b.category) ||
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
        <PriceCell price={m.price} category={m.category} model={m} />
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


/** The Agent's models: one per category, at each level. Edits, voice and the rest follow the capability rule by themselves. */
const TABLE: Array<{ role: Role; icon: React.ElementType; legacy: GroupCategory; label: string }> = [
  { role: "text", icon: Wand2, legacy: "text", label: "Chat" },
  { role: "image", icon: ImageIcon, legacy: "image", label: "Image" },
  { role: "video", icon: Video, legacy: "video", label: "Video" },
  { role: "music", icon: AudioLines, legacy: "audio", label: "Audio" },
]

const LEVELS = ["low", "medium", "high"]

/**
 * The Agent Model: the Agent has no model picker of its own, so its chat, image, video and audio models are set here, at each level it
 * works at. Nothing needs setting: every row follows its level (Low the cheapest model, High the best) and picks up new models by
 * itself. A row set by hand keeps that choice until it is reset. Create and Apps choose their own models.
 */
export function ModelsSection({ settings, onChange }: Props) {
  const all = useRegistry()
  const listed = useListedModels()
  const byId = React.useMemo(() => new Map(all.map((m) => [m.id, m])), [all])
  const raw: ModelGroup[] = React.useMemo(() => settings.aiEngine.groups ?? LEVELS.map((id) => ({ id, name: id[0]!.toUpperCase() + id.slice(1), models: {} })), [settings.aiEngine.groups])
  const resolved = React.useMemo(() => resolveGroups(raw, listed), [raw, listed])
  const [groupId, setGroupId] = React.useState<string>(settings.aiEngine.activeGroupId ?? "medium")
  const rawGroup = raw.find((g) => g.id === groupId) ?? raw[0]
  const group = resolved.find((g) => g.id === rawGroup?.id) ?? resolved[0]


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

  const poolFor = (cat: GroupCategory) => listed.filter((m) => m.category === cat)

  const setRole = (row: (typeof TABLE)[number], id: string | null) =>
    updateRaw((g) => {
      const models = { ...g.models }
      if (id) models[row.legacy] = { ...(models[row.legacy] ?? {}), modelId: id }
      else delete models[row.legacy]
      return { ...g, models }
    })

  return (
    <div className="space-y-4">
      {!listed.some((m) => m.category === "text") && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">No chat model yet.</span> Chat and the agent need one. Add a key for OpenRouter, Google Gemini, OpenAI or Replicate in Providers.
          </p>
        </div>
      )}

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
              const pinnedId = rawGroup.models[row.legacy]?.modelId
              const rec = byId.get(group.models[row.legacy]?.modelId ?? "")
              const entry = group.models[row.legacy]
              const optionKeys = rec ? Object.keys(rec.params.properties).filter((k) => isEditable(rec.params.properties[k]!) && rec.params.properties[k]!.tier !== "advanced" && rec.params.properties[k]!.tier !== "technical") : []
              const values = { ...(rec ? defaultsFor(rec.params) : {}), ...(entry?.params ?? {}) }
              const pool = poolFor(row.legacy)
              return (
                <div key={row.role} className="flex items-center gap-2">
                  <span className="flex w-32 flex-shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <row.icon className="h-3.5 w-3.5" />
                    {row.label}
                  </span>
                  <ModelPick pool={pool} label={row.label} onPick={(id) => setRole(row, id)}>
                    <Button type="button" variant="outline" size="sm" className={cn("h-7 min-w-0 max-w-64 flex-1 justify-start gap-2", !rec && "border-destructive/50 text-destructive")}>
                      {rec ? <ModelLogo name={rec.name} endpoint={rec.endpoint} family={rec.family} provider={rec.provider} size={14} /> : null}
                      <span className="truncate">{rec?.name ?? `No ${row.label.toLowerCase()} model. Add a key or a model.`}</span>
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
                          onChange={(key, value) => updateRaw((g) => ({ ...g, models: { ...g.models, [row.legacy]: { modelId: rec.id, params: { ...(g.models[row.legacy]?.params ?? {}), [key]: value } } } }))}
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

            <p className="pt-1 text-xs text-muted-foreground">{tierOfGroup(group) === "low" ? "Low: the cheapest model that does each job." : tierOfGroup(group) === "high" ? "High: the best model for each job." : "Medium: a model in the middle of the price range."}</p>
          </div>
        )}
      </div>
    </div>
  )
}
