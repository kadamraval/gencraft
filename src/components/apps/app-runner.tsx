import { ArrowLeft, Check, Copy, Pencil, Play, Square, Trash2 } from "lucide-react"
import * as React from "react"
import { MessageResponse } from "@/components/ai-elements/message"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { MediaGallery } from "@/components/create/media-gallery"
import type { PendingRun } from "@/components/create/media-gallery"
import type { DetailMediaItem } from "@/components/media-vault/media-detail-modal"
import type { EditAction } from "@/lib/registry/edit-actions"
import { expectedRun } from "@/lib/ledger/run-times"
import { ModelSelectorPopover } from "@/components/chat/model-selector-popover"
import { Button } from "@/components/ui/button"
import { ErrorNotice } from "@/components/ui/error-notice"
import { estimateApp, defaultValues, missingInputs, referencesFor, runApp } from "@/lib/apps/engine"
import type { Values } from "@/lib/apps/engine"
import { getListedModels } from "@/lib/registry/store"
import { needOf, slotsOf } from "@/lib/apps/capabilities"
import { makeRunDeps, modelFor, priceOfStep, settingsFor } from "@/lib/apps/runtime"
import { addRun, removeApp, useRuns } from "@/lib/apps/store"
import { GENERATE_KINDS } from "@/lib/apps/types"
import type { AppSpec, AppStep, GenerateStepKind, InputValue, StepEvent } from "@/lib/apps/types"
import { usageLedger } from "@/lib/ledger/usage-store"
import { formatMoney as money } from "@/lib/currency/currency"
import { explainError } from "@/lib/errors/explain"
import { askOverUsd } from "@/lib/spend"
import type { CardSizeStep, LayoutMode, MediaAsset, SettingsState } from "@/types"
import { cn } from "@/lib/utils"
import { MediaReferenceModal } from "@/components/chat/media-reference-modal"
import type { ReferenceMediaItem } from "@/components/chat/media-reference-modal"
import type { ElementItem } from "@/lib/elements/types"
import { AppInputs } from "./app-blocks"
import type { PickRequest } from "./app-blocks"
import { GenerationBar } from "./generation-bar"
import type { BarStep } from "./generation-bar"
import { appColor, appIcon } from "./icons"

interface Props {
  spec: AppSpec
  settings: SettingsState
  assets: MediaAsset[]
  projectId?: string
  onBack: () => void
  onAssets: (assets: MediaAsset[]) => void
  onOpenAsset?: (asset: MediaAsset) => void
  /** Back to the chat with the agent, to change the app */
  onEdit: (spec: AppSpec) => void
  /** Makes a copy the person owns and opens it */
  onRemix: (spec: AppSpec) => void
  onOpenSettings?: (tab?: string) => void
  /** What Create's own results view needs, so an app's results are shown, opened, reused and deleted exactly as they are in Create */
  layoutMode: LayoutMode
  cardSizeStep: CardSizeStep
  onReuse: (item: DetailMediaItem) => void
  onTurnToVideo?: (item: DetailMediaItem) => void
  onUseAsReference?: (item: DetailMediaItem) => void
  onDelete: (ids: string[]) => void
  editActions?: EditAction[]
  onEditMedia?: (item: DetailMediaItem, action: EditAction) => void
}

const ago = (at: number) => {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`
}

const isGenerate = (s: AppStep) => (GENERATE_KINDS as readonly string[]).includes(s.kind)

/**
 * An app, open. The left sidebar reads top to bottom: the app's icon and name, what to upload, the app's own options, then the
 * model and its settings, drawn the way the composer draws them. Generate is at the bottom. What the app has made is on the right.
 */
export function AppRunner({ spec, settings, assets, projectId, onBack, onAssets, onEdit, onRemix, onOpenSettings, layoutMode, cardSizeStep, onReuse, onTurnToVideo, onUseAsReference, onDelete, editActions, onEditMedia }: Props) {
  const Icon = appIcon(spec.icon)
  const runs = useRuns(spec.id)
  const [values, setValues] = React.useState<Values>(() => defaultValues(spec))
  const [models, setModels] = React.useState<Record<string, string>>({})
  const [stepSettings, setStepSettings] = React.useState<Record<string, Record<string, unknown>>>({})
  const [picking, setPicking] = React.useState<string | null>(null)
  const [running, setRunning] = React.useState(false)
  const [steps, setSteps] = React.useState<Record<string, StepEvent>>({})
  const [error, setError] = React.useState<string | null>(null)
  // Something to fix before it can run (an empty field, a used-up budget): one plain line, not an error card
  const [notice, setNotice] = React.useState<string | null>(null)
  const [confirm, setConfirm] = React.useState<number | null>(null)
  const [copied, setCopied] = React.useState<string | null>(null)
  const stopper = React.useRef<AbortController | null>(null)
  // When each make step started, for the waiting tile's clock
  const startedAt = React.useRef<Record<string, number>>({})

  // The studio's own picture picker (upload, Created, Element, Liked) opens from any upload block. One block takes one picture and
  // closes; the strip keeps several and stays open until you click away.
  const [picker, setPicker] = React.useState<(PickRequest & { chosen: Array<{ id: string; url: string }> }) | null>(null)
  const choose = (id: string, url: string) => {
    if (!picker) return
    if (!picker.multiple) {
      picker.onPick([url])
      setPicker(null)
      return
    }
    const has = picker.chosen.some((c) => c.id === id)
    const chosen = has ? picker.chosen.filter((c) => c.id !== id) : picker.chosen.length < picker.limit ? [...picker.chosen, { id, url }] : picker.chosen
    picker.onPick(chosen.map((c) => c.url))
    setPicker({ ...picker, chosen })
  }

  // The app was changed: answers start from its defaults again, keeping what still fits
  React.useEffect(() => {
    setValues((prev) => {
      const fresh = defaultValues(spec)
      for (const i of spec.inputs) if (prev[i.id] !== undefined) fresh[i.id] = prev[i.id]
      return fresh
    })
    setModels({})
    setStepSettings({})
    setError(null)
    setNotice(null)
    setConfirm(null)
  }, [spec])

  // The app as it will really run: the person's model and settings on top of what the author set
  const effective = React.useMemo<AppSpec>(
    () => ({ ...spec, steps: spec.steps.map((s) => (isGenerate(s) ? { ...s, model: models[s.id] ?? s.model ?? "auto", params: { ...(s.params ?? {}), ...(stepSettings[s.id] ?? {}) } } : s)) }),
    [spec, models, stepSettings],
  )
  const estimate = React.useMemo(() => estimateApp(effective, values, priceOfStep), [effective, values])
  const set = (id: string, v: InputValue) => setValues((prev) => ({ ...prev, [id]: v }))
  const generateSteps = effective.steps.filter(isGenerate)
  // What this app made, shown by kind; and the steps still making something, as waiting tiles
  const madeKinds = [...new Set(generateSteps.map((st) => st.kind as GenerateStepKind))]
  const madeIds = new Set(runs.flatMap((r) => r.assetIds))
  const madeAssets = assets.filter((a) => madeIds.has(a.id))
  const pendingRuns: PendingRun[] = running
    ? generateSteps
        .filter((st) => steps[st.id]?.state === "running")
        .map((st) => {
          const rec = modelFor(st.kind as GenerateStepKind, st.model ?? "auto", needOf(st, spec.inputs))
          return { id: `${spec.id}-${st.id}`, prompt: st.prompt ?? "", job: { kind: st.kind as GenerateStepKind, status: "running" as const, startedAt: startedAt.current[st.id] ?? Date.now(), count: st.count ?? 1, expected: rec ? expectedRun(rec.id) : undefined, modelName: rec?.name } }
        })
    : []

  const start = async (confirmed = false) => {
    const missing = missingInputs(spec, values)
    setNotice(null)
    if (missing.length > 0) return setNotice(`Fill in: ${missing.join(", ")}.`)
    // The model that will run must take as many pictures as are given: the person may have chosen another model than the app's
    const listedNow = getListedModels()
    for (const step of generateSteps) {
      const given = referencesFor(step, values).length
      const rec = given > 0 ? modelFor(step.kind as GenerateStepKind, step.model ?? "auto", given) : undefined
      if (rec && slotsOf(rec, listedNow).pictures < given) return setNotice(`${rec.name} takes at most ${slotsOf(rec, listedNow).pictures} reference picture${slotsOf(rec, listedNow).pictures === 1 ? "" : "s"}, and ${given} were given. Remove one or choose another model.`)
    }
    const limits = settings.aiEngine.limits ?? {}
    if (limits.monthlyBudgetUsd && usageLedger.getSpendOverview("monthly").totalCostUsd >= limits.monthlyBudgetUsd) {
      return setNotice("This month's budget is used up. Raise it in Settings, General, Spending & limits to keep going.")
    }
    const ask = askOverUsd(settings.aiEngine)
    if (!confirmed && ask && estimate !== null && estimate > ask) return setConfirm(estimate)
    setConfirm(null)
    setError(null)
    setSteps({})
    setRunning(true)
    stopper.current = new AbortController()
    const runId = `apprun-${Date.now()}`
    try {
      const result = await runApp(effective, values, makeRunDeps(effective, { settings, projectId, runId, signal: stopper.current.signal, onStep: (e) => {
        if (e.state === "running") startedAt.current[e.stepId] = Date.now()
        setSteps((prev) => ({ ...prev, [e.stepId]: e }))
      } }))
      onAssets(result.assets)
      addRun({ id: runId, appId: spec.id, at: Date.now(), texts: result.shown.texts.map((t) => ({ title: t.title, text: t.text })), assetIds: result.shown.assets.map((a) => a.id), costUsd: result.costUsd })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
      stopper.current = null
    }
  }

  const copy = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text)
    setCopied(key)
    window.setTimeout(() => setCopied(null), 1500)
  }

  const barSteps: BarStep[] = generateSteps.map((step) => {
    const rec = modelFor(step.kind as GenerateStepKind, step.model ?? "auto", needOf(step, spec.inputs))
    return { id: step.id, title: step.title, rec, shown: rec ? settingsFor(rec, step.params ?? {}) : {}, userSettings: step.userSettings, controlled: Object.keys(step.paramInputs ?? {}) }
  })
  const pickingStep = picking ? generateSteps.find((s) => s.id === picking) : undefined

  return (
    <div className="relative flex h-full min-h-0">
      <aside className="relative flex w-80 flex-shrink-0 flex-col border-r border-border bg-background">
        <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
          <Button type="button" variant="ghost" size="iconSm" aria-label="Back to apps" onClick={onBack} className="h-7 w-7 flex-shrink-0 p-0 text-muted-foreground">
            <ArrowLeft className="size-4" />
          </Button>
          <div className={cn("flex size-8 flex-shrink-0 items-center justify-center rounded-lg", appColor(spec.color))}>
            <Icon className="size-4" />
          </div>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{spec.name}</p>
          {spec.system ? (
            <Button type="button" variant="ghost" size="iconSm" aria-label="Remix as my own" title="Remix as my own" onClick={() => onRemix(spec)} className="h-7 w-7 flex-shrink-0 p-0 text-muted-foreground hover:text-foreground">
              <Copy className="size-3.5" />
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" size="iconSm" aria-label="Edit with the agent" title="Edit with the agent" onClick={() => onEdit(spec)} className="h-7 w-7 flex-shrink-0 p-0 text-muted-foreground hover:text-foreground">
                <Pencil className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="iconSm" aria-label="Delete this app" title="Delete this app" onClick={() => (removeApp(spec.id), onBack())} className="h-7 w-7 flex-shrink-0 p-0 text-muted-foreground hover:text-destructive">
                <Trash2 className="size-3.5" />
              </Button>
            </>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 no-scrollbar">
          <AppInputs fill inputs={spec.inputs} values={values} onChange={(id, v) => set(id, v)} pick={(request) => setPicker({ ...request, chosen: request.selected.map((url) => ({ id: url, url })) })} />
        </div>

        <div className="space-y-3 border-t border-border p-4">
          {notice && <p className="text-xs text-destructive">{notice}</p>}
          {barSteps.length > 0 && <GenerationBar steps={barSteps} picking={picking} onPick={(id) => setPicking(picking === id ? null : id)} onSetting={(id, k, v) => setStepSettings((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [k]: v } }))} />}
          {error && <ErrorNotice info={explainError(error)} fallbackTitle="It stopped" message={error} onRetry={() => void start(true)} />}
          {confirm !== null ? (
            <div className="space-y-2 text-xs">
              <p className="text-muted-foreground">{`About ${money(confirm)}, which is over your limit. Run it?`}</p>
              <div className="flex gap-1.5">
                <Button type="button" size="sm" variant="ghost" className="h-8 flex-1 text-xs" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" className="h-8 flex-1 text-xs" onClick={() => void start(true)}>
                  Run it
                </Button>
              </div>
            </div>
          ) : running ? (
            <Button type="button" variant="secondary" className="h-9 w-full gap-1.5 text-xs" onClick={() => stopper.current?.abort()}>
              <Square className="size-3" /> Stop
            </Button>
          ) : (
            <Button type="button" className="h-9 w-full gap-1.5 text-xs" onClick={() => void start()}>
              <Play className="size-3.5" />
              Generate
              {estimate !== null && estimate > 0 && <span className="opacity-70">{`· about ${money(estimate)}`}</span>}
            </Button>
          )}
        </div>

        {pickingStep && (
          <div className="absolute inset-x-0 bottom-32 z-50">
            <ModelSelectorPopover
              compact
              activeModelId={modelFor(pickingStep.kind as GenerateStepKind, pickingStep.model ?? "auto", needOf(pickingStep, spec.inputs))?.id ?? ""}
              modality={pickingStep.kind as GenerateStepKind}
              needs={(pickingStep.references ?? []).length > 0 ? { images: 1 } : undefined}
              settings={settings}
              onOpenSettings={onOpenSettings}
              onSelectModel={(id) => {
                setModels((prev) => ({ ...prev, [pickingStep.id]: id }))
                setStepSettings((prev) => ({ ...prev, [pickingStep.id]: {} }))
                setPicking(null)
              }}
              onClose={() => setPicking(null)}
            />
          </div>
        )}
      </aside>

      <section className="min-w-0 flex-1 select-text overflow-y-auto p-6 no-scrollbar">
        <div className="mx-auto max-w-4xl space-y-8">
          {running && (
            <div className="space-y-1.5">
              {spec.steps.filter((st) => !isGenerate(st)).map((st) => {
                const e = steps[st.id]
                return (
                  <div key={st.id} className={cn("flex items-center gap-2 text-sm", e?.state === "done" ? "text-muted-foreground" : e?.state === "error" ? "text-destructive" : "text-foreground")}>
                    {e?.state === "done" ? <Check className="size-3.5" /> : <span className={cn("size-3.5 rounded-full border border-border", e?.state === "running" && "animate-pulse border-primary")} />}
                    {e?.state === "running" ? <Shimmer as="span">{`${st.title}…`}</Shimmer> : <span>{st.title}</span>}
                  </div>
                )
              })}
            </div>
          )}

          {runs.some((run) => run.texts.length > 0) && (
            <div className="space-y-3">
              {runs.flatMap((run) =>
                run.texts.map((t, i) => (
                  <div key={`${run.id}-${i}`} className="group relative rounded-xl bg-secondary p-4 text-sm animate-in fade-in duration-300">
                    <p className="mb-1.5 text-xs text-muted-foreground">{`${ago(run.at)}${run.costUsd > 0 ? ` · ${money(run.costUsd)}` : ""}`}</p>
                    <MessageResponse>{t.text}</MessageResponse>
                    <Button type="button" variant="ghost" size="iconSm" aria-label="Copy" onClick={() => copy(`${run.id}-${i}`, t.text)} className="absolute right-2 top-2 h-6 w-6 p-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      {copied === `${run.id}-${i}` ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    </Button>
                  </div>
                )),
              )}
            </div>
          )}

          {/* What the app makes, in Create's own view: its cards, the waiting card with its clock, the opened result, reuse and delete */}
          {madeKinds.map((kind) => (
            <div key={kind} className={cn("flex flex-col", madeKinds.length > 1 ? "h-[28rem]" : "min-h-[70vh]")}>
              <MediaGallery
                kind={kind}
                assets={madeAssets}
                pending={pendingRuns.filter((p) => p.job.kind === kind)}
                layoutMode={layoutMode}
                cardSizeStep={cardSizeStep}
                onReuse={onReuse}
                onTurnToVideo={onTurnToVideo}
                onUseAsReference={onUseAsReference}
                editActions={editActions}
                onEdit={onEditMedia}
                onDelete={onDelete}
                onDismiss={() => setError(null)}
                hideFolders
                empty={
                  <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
                    <div className={cn("flex size-10 items-center justify-center rounded-full", appColor(spec.color))}>
                      <Icon className="size-5" />
                    </div>
                    <p className="text-sm text-foreground">Your results will appear here</p>
                    <p className="max-w-xs text-xs text-muted-foreground">{spec.description}</p>
                  </div>
                }
              />
            </div>
          ))}
          {madeKinds.length === 0 && runs.length === 0 && !running && (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
              <div className={cn("flex size-10 items-center justify-center rounded-full", appColor(spec.color))}>
                <Icon className="size-5" />
              </div>
              <p className="text-sm text-foreground">Your results will appear here</p>
              <p className="max-w-xs text-xs text-muted-foreground">{spec.description}</p>
            </div>
          )}
        </div>
      </section>
      <div className="absolute inset-x-0 bottom-6 z-50 mx-auto w-full max-w-3xl">
        <MediaReferenceModal
          isOpen={picker !== null}
          onClose={() => setPicker(null)}
          onSelectReference={(item: ReferenceMediaItem) => item.type === (picker?.kind ?? "image") && choose(item.id, item.url)}
          onSelectElement={(item: ElementItem) => picker?.kind === "image" && item.imageUrls[0] && choose(item.id, item.imageUrls[0])}
          selectedReferenceIds={picker?.chosen.map((c) => c.id) ?? []}
          singlePick={picker ? !picker.multiple : false}
          unsupportedTypes={Object.fromEntries((["image", "video", "audio"] as const).filter((k) => k !== (picker?.kind ?? "image")).map((k) => [k, `This box takes a ${picker?.kind ?? "picture"}`]))}
          referenceNote={picker ? (picker.kind === "image" ? `${picker.label}: choose a picture, or one of your elements.` : `${picker.label}: choose a ${picker.kind}.`) : undefined}
          assets={assets}
          activeProjectId={projectId}
          settings={settings}
          onOpenSettings={onOpenSettings}
        />
      </div>
    </div>
  )
}
