import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import type { AppMeta } from "@/lib/apps/app-types"
import { newAppId, remix, saveApp, useApps } from "@/lib/apps/store"
import type { AppSpec } from "@/lib/apps/types"
import type { CardSizeStep, LayoutMode, MediaAsset, SettingsState } from "@/types"
import type { DetailMediaItem } from "@/components/media-vault/media-detail-modal"
import type { EditAction } from "@/lib/registry/edit-actions"
import { cn } from "@/lib/utils"
import { AppRunner } from "./app-runner"
import { EditApp } from "./edit-app"
import { VideoEditApp, type VideoEditDeps } from "./video-edit-app"
import { BUILTIN_CARDS, type BuiltinCard } from "@/lib/apps/builtin-cards"
import { useToolContext } from "@/components/ai-tools/use-tool-context"
import { toolsFor } from "@/lib/ai-tools/match"
import { modelsFor } from "@/lib/capability/match"
import { useListedModels } from "@/lib/registry/store"
import { appCategory } from "@/lib/apps/types"
import { NewAppDialog } from "@pro/apps/new-app-dialog"
import { UpgradeDialog } from "@/components/license/upgrade-card"
import { FEATURE_NAMES, useFeature } from "@/lib/license"

interface Props {
  settings: SettingsState
  assets: MediaAsset[]
  projectId?: string
  /** Starts building an app with the studio's agent: the name, icon and color from the dialog, and the app when it is being changed */
  onBuild: (meta: AppMeta, existing?: AppSpec) => void
  /** An app the agent just built, to open */
  openRequest?: AppSpec
  onOpenHandled?: () => void
  onAssets: (assets: MediaAsset[]) => void
  onOpenAsset?: (asset: MediaAsset) => void
  onOpenSettings?: (tab?: string) => void
  /** What Create's own results view needs */
  layoutMode: LayoutMode
  cardSizeStep: CardSizeStep
  onReuse: (item: DetailMediaItem) => void
  onTurnToVideo?: (item: DetailMediaItem) => void
  onUseAsReference?: (item: DetailMediaItem) => void
  onDelete: (ids: string[]) => void
  editActions?: EditAction[]
  onEditMedia?: (item: DetailMediaItem, action: EditAction) => void
  /** Opens Create in this mode */
  onCreate?: (category: AppCategoryId) => void
  /** What the timeline editor needs when Video Edit opens here */
  videoEdit?: VideoEditDeps
  /** A built-in card to open with a file loaded (from "Use image" in a picture's popup) */
  openCard?: { cardId: string; file: { url: string; name: string } }
  onOpenCardHandled?: () => void
  /** A cut to open in Video Edit (from "Open in Video Edit" on a clip) */
  openCut?: string
  onOpenCutHandled?: () => void
}

type AppCategoryId = "image" | "video" | "audio" | "text"
type Screen =
  | { kind: "home" }
  | { kind: "open"; spec: AppSpec }
  | { kind: "edit"; category: "image" | "video" | "audio"; tool?: string; title?: string; file?: { url: string; name: string } }
  | { kind: "video-edit"; cutId?: string }
  | { kind: "more"; category: AppCategoryId }
type Tab = "all" | AppCategoryId
type Shelf = "builtin" | "mine"

const CATEGORIES: Array<{ id: AppCategoryId; label: string }> = [
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "text", label: "Text" },
]
/** Cards in a row before "Show more" */
const ROW = 7

/** One app as a card: its picture or GIF when it has one, its name and one short line. No icon. */
function AppCard({ name, cover, hint, state, reason, onOpen }: { name: string; cover?: string; hint?: string; state?: "ready" | "muted" | "soon"; reason?: string; onOpen: () => void }) {
  const soon = state === "soon"
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onOpen}
      disabled={soon}
      title={state === "muted" ? reason : undefined}
      className={cn("h-auto w-full flex-col items-stretch gap-1.5 whitespace-normal rounded-2xl p-1.5 text-left hover:bg-secondary", state === "muted" && "opacity-50")}
    >
      <span className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-secondary/60">
        {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <span className="line-clamp-2 px-3 text-center text-sm font-medium text-muted-foreground">{name}</span>}
        {soon && <span className="absolute right-2 top-2 rounded-md bg-background/80 px-1.5 py-0.5 text-xs text-muted-foreground">Soon</span>}
      </span>
      <span className="line-clamp-1 w-full px-1 text-xs font-medium text-foreground">{name}</span>
      {hint && <span className="line-clamp-1 w-full px-1 text-xs font-normal text-muted-foreground">{hint}</span>}
    </Button>
  )
}

/** One category's cards in a row that slides sideways, with arrows at the right; the last card opens the full grid */
function CardRow({ title, cards, onMore }: { title: string; cards: React.ReactNode[]; onMore: () => void }) {
  const row = React.useRef<HTMLDivElement>(null)
  const slide = (dir: number) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: "smooth" })
  return (
    <section className="min-w-0 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-muted-foreground">{title}</h2>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="iconSm" aria-label={`Scroll ${title} left`} onClick={() => slide(-1)} className="h-7 w-7 text-muted-foreground">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="iconSm" aria-label={`Scroll ${title} right`} onClick={() => slide(1)} className="h-7 w-7 text-muted-foreground">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div ref={row} className="flex snap-x gap-2 overflow-x-auto scroll-smooth pb-1 no-scrollbar">
        {cards.slice(0, ROW).map((c, i) => (
          <div key={i} className="w-44 flex-shrink-0 snap-start">
            {c}
          </div>
        ))}
        {cards.length > ROW && (
          <div className="w-44 flex-shrink-0 snap-start">
            <Button type="button" variant="ghost" onClick={onMore} className="flex aspect-[4/3] h-auto w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border text-xs text-muted-foreground hover:bg-secondary">
              <span className="text-sm font-medium text-foreground">Show more</span>
              <span>{cards.length - ROW} more</span>
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Apps, by category (Image, Video, Audio, Text). Built-in: Image Edit and Video Edit (the app's two editors), Edit options as their own
 * cards, and the special apps. My apps: the ones the person made. A card the person's models cannot run yet is muted with the reason;
 * one not built yet says Soon.
 */
export function AppsView({ settings, assets, projectId, onBuild, openRequest, onOpenHandled, onAssets, onOpenSettings, layoutMode, cardSizeStep, onReuse, onTurnToVideo, onUseAsReference, onDelete, editActions, onEditMedia, onCreate, videoEdit, openCard: cardRequest, onOpenCardHandled, openCut, onOpenCutHandled }: Props) {
  const { system, mine } = useApps()
  const [screen, setScreen] = React.useState<Screen>({ kind: "home" })
  const [tab, setTab] = React.useState<Tab>("all")
  const [shelf, setShelf] = React.useState<Shelf>("builtin")
  // The model lists change many times while the providers are read; the cards follow without holding up the page
  const listed = React.useDeferredValue(useListedModels())
  const toolCtx = React.useDeferredValue(useToolContext(settings))
  // What the person's models can do, by the one rule, worked out once per change: nothing is listed by hand
  const offers = React.useMemo(
    () => ({ image: toolsFor({ kind: "image", surface: "apps" }, toolCtx), video: toolsFor({ kind: "video", surface: "apps" }, toolCtx), audio: toolsFor({ kind: "audio", surface: "apps" }, toolCtx) }),
    [toolCtx],
  )
  const can = React.useMemo(() => {
    const out = {} as Record<AppCategoryId, { create: boolean; edit: boolean }>
    for (const c of CATEGORIES) {
      const create = modelsFor({ gives: c.id, does: c.id === "text" ? "chat" : c.id === "audio" ? ["speech", "music", "sfx", "make"] : "make" }, listed).length > 0
      const edit = c.id !== "text" && offers[c.id].some((o) => o.status.state === "ready")
      out[c.id] = { create, edit }
    }
    return out
  }, [listed, offers])
  const [creating, setCreating] = React.useState(false)
  const canBuild = useFeature("buildApps")

  React.useEffect(() => {
    if (!cardRequest) return
    const card = BUILTIN_CARDS.find((c) => c.id === cardRequest.cardId)
    const o = card?.opens
    if (card && o?.kind === "edit") setScreen({ kind: "edit", category: o.media, tool: o.tool, title: card.name, file: cardRequest.file })
    else if (card && o?.kind === "app") {
      const spec = system.find((a) => a.id === o.appId)
      if (spec) setScreen({ kind: "open", spec })
    }
    onOpenCardHandled?.()
  }, [cardRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!openCut) return
    setScreen({ kind: "video-edit", cutId: openCut })
    onOpenCutHandled?.()
  }, [openCut]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!openRequest) return
    setScreen({ kind: "open", spec: openRequest })
    onOpenHandled?.()
  }, [openRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  const home = () => setScreen({ kind: "home" })

  if (screen.kind === "open") {
    return (
      <AppRunner
        key={screen.spec.id}
        spec={screen.spec}
        settings={settings}
        assets={assets}
        projectId={projectId}
        onBack={home}
        onAssets={onAssets}
        onOpenSettings={onOpenSettings}
        layoutMode={layoutMode}
        cardSizeStep={cardSizeStep}
        onReuse={onReuse}
        onTurnToVideo={onTurnToVideo}
        onUseAsReference={onUseAsReference}
        onDelete={onDelete}
        editActions={editActions}
        onEditMedia={onEditMedia}
        onEdit={(spec) => onBuild({ name: spec.name, icon: spec.icon, color: spec.color }, spec)}
        onRemix={(spec) => setScreen({ kind: "open", spec: saveApp({ ...remix(spec), id: newAppId() }) })}
      />
    )
  }

  if (screen.kind === "edit") {
    return <EditApp kind={screen.category} tool={screen.tool} title={screen.title} file={screen.file} settings={settings} assets={assets} projectId={projectId} onBack={home} onAssets={onAssets} onOpenSettings={onOpenSettings} />
  }

  if (screen.kind === "video-edit" && videoEdit) {
    return <VideoEditApp deps={videoEdit} openId={screen.cutId} onBack={home} />
  }

  const open = (spec: AppSpec) => setScreen({ kind: "open", spec })
  const createButton = (
    <Button type="button" onClick={() => setCreating(true)} className="gap-1.5">
      <Plus className="size-4" /> Create new
    </Button>
  )

  // What a card can do now: an Edit option is ready when its models are; an app or Create when its kind can be made
  const stateOf = (card: BuiltinCard): { state: "ready" | "muted" | "soon"; reason?: string } => {
    const o = card.opens
    const make = "Add a key for a model that makes this"
    if (o.kind === "soon") return { state: "soon" }
    if (o.kind === "video-edit") return { state: "ready" }
    if (o.kind === "edit") {
      if (!o.tool) return can[o.media].edit ? { state: "ready" } : { state: "muted", reason: "Add a key for a model that edits this kind of file" }
      const offer = offers[o.media].find((x) => x.spec.id === o.tool)
      return offer?.status.state === "ready" ? { state: "ready" } : { state: "muted", reason: offer && "reason" in offer.status ? offer.status.reason : "None of your models does this yet" }
    }
    if (o.kind === "create") return can[o.mode].create ? { state: "ready" } : { state: "muted", reason: make }
    return can[card.category].create ? { state: "ready" } : { state: "muted", reason: make }
  }
  const openCard = (card: BuiltinCard) => {
    const o = card.opens
    if (o.kind === "edit") setScreen({ kind: "edit", category: o.media, tool: o.tool, title: card.name })
    else if (o.kind === "video-edit") setScreen({ kind: "video-edit" })
    else if (o.kind === "create") onCreate?.(o.mode)
    else if (o.kind === "app") {
      const spec = system.find((a) => a.id === o.appId)
      if (spec) open(spec)
    }
  }
  const builtinCards = (cat: AppCategoryId) =>
    BUILTIN_CARDS.filter((c) => c.category === cat).map((c) => {
      const st = stateOf(c)
      return <AppCard key={c.id} name={c.name} hint={c.hint} state={st.state} reason={st.reason} onOpen={() => openCard(c)} />
    })
  const myCards = (cat: AppCategoryId) => mine.filter((a) => appCategory(a) === cat).map((a) => <AppCard key={a.id} name={a.name} cover={a.cover} hint={a.description} onOpen={() => open(a)} />)
  const cardsOf = (cat: AppCategoryId) => (shelf === "builtin" ? builtinCards(cat) : myCards(cat))
  const shown = tab === "all" ? CATEGORIES : CATEGORIES.filter((c) => c.id === tab)
  const pill = (active: boolean) => cn("h-7 rounded-md px-3 text-xs", active ? "border border-border/70 bg-card font-semibold text-foreground shadow-xs" : "text-muted-foreground hover:bg-secondary hover:text-foreground")

  if (screen.kind === "more") {
    const cat = CATEGORIES.find((c) => c.id === screen.category)!
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 px-8 pb-2 pt-6">
          <Button type="button" variant="ghost" size="icon" aria-label="Back to apps" onClick={home} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-sm font-semibold text-foreground">{cat.label}</h1>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-24 pt-2 no-scrollbar">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">{cardsOf(cat.id)}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-8 pb-2 pt-6">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border/50 bg-secondary/80 p-0.5">
          {([{ id: "all", label: "All" }, ...CATEGORIES] as Array<{ id: Tab; label: string }>).map((t) => (
            <Button key={t.id} type="button" variant="ghost" size="sm" aria-pressed={tab === t.id} onClick={() => setTab(t.id)} className={pill(tab === t.id)}>
              {t.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg border border-border/50 bg-secondary/80 p-0.5">
            {(
              [
                ["builtin", "Built-in"],
                ["mine", "My apps"],
              ] as const
            ).map(([id, label]) => (
              <Button key={id} type="button" variant="ghost" size="sm" aria-pressed={shelf === id} onClick={() => setShelf(id)} className={pill(shelf === id)}>
                {label}
              </Button>
            ))}
          </div>
          {createButton}
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 select-text space-y-8 overflow-y-auto overflow-x-hidden px-8 pb-24 pt-4 no-scrollbar">
        {shown.map((c) => {
          const cards = cardsOf(c.id)
          if (cards.length === 0) return null
          return tab === "all" ? (
            <CardRow key={c.id} title={c.label} cards={cards} onMore={() => setScreen({ kind: "more", category: c.id })} />
          ) : (
            <div key={c.id} className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {cards}
            </div>
          )
        })}
        {shelf === "mine" && shown.every((c) => cardsOf(c.id).length === 0) && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Make your own app</h1>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">Tell the agent what you want to make, and it builds an app you can open any time.</p>
            </div>
            {createButton}
          </div>
        )}
      </div>

      {!canBuild && <UpgradeDialog open={creating} onClose={() => setCreating(false)} feature={FEATURE_NAMES.buildApps} />}
      <NewAppDialog
        open={creating && canBuild}
        onClose={() => setCreating(false)}
        onContinue={(meta) => {
          setCreating(false)
          onBuild(meta)
        }}
      />
    </div>
  )
}
