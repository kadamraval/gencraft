import { Plus } from "lucide-react"
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
import { appColor, appIcon } from "./icons"
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
}

type Screen = { kind: "home" } | { kind: "open"; spec: AppSpec }
type Tab = "personal" | "builtin"

/** One app in a grid: its icon on its colour, and its name */
function Tile({ spec, onOpen }: { spec: AppSpec; onOpen: () => void }) {
  const Icon = appIcon(spec.icon)
  return (
    <Button type="button" variant="ghost" onClick={onOpen} className="h-auto flex-col gap-2.5 whitespace-normal rounded-2xl px-2 py-4 hover:bg-secondary">
      <span className={cn("flex size-14 items-center justify-center rounded-2xl", appColor(spec.color))}>
        <Icon className="size-6" />
      </span>
      <span className="line-clamp-2 w-full text-center text-xs font-medium text-foreground">{spec.name}</span>
    </Button>
  )
}

/**
 * Apps: small tools that make things from what you give them. "Personal" holds the ones you made with the agent; "In-built"
 * holds the ones that come with the studio. Opening one shows its inputs on the left and everything it has made on the right.
 */
export function AppsView({ settings, assets, projectId, onBuild, openRequest, onOpenHandled, onAssets, onOpenSettings, layoutMode, cardSizeStep, onReuse, onTurnToVideo, onUseAsReference, onDelete, editActions, onEditMedia }: Props) {
  const { system, mine } = useApps()
  const [screen, setScreen] = React.useState<Screen>({ kind: "home" })
  const [tab, setTab] = React.useState<Tab>("personal")
  const [creating, setCreating] = React.useState(false)
  const canBuild = useFeature("buildApps")

  React.useEffect(() => {
    if (!openRequest) return
    setScreen({ kind: "open", spec: openRequest })
    onOpenHandled?.()
  }, [openRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  if (screen.kind === "open") {
    return (
      <AppRunner
        key={screen.spec.id}
        spec={screen.spec}
        settings={settings}
        assets={assets}
        projectId={projectId}
        onBack={() => setScreen({ kind: "home" })}
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

  const open = (spec: AppSpec) => setScreen({ kind: "open", spec })
  const createButton = (
    <Button type="button" onClick={() => setCreating(true)} className="gap-1.5">
      <Plus className="size-4" /> Create new
    </Button>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 px-8 pb-2 pt-6">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border/50 bg-secondary/80 p-0.5">
          {(["personal", "builtin"] as const).map((t) => (
            <Button
              key={t}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
              className={cn("h-7 rounded-md px-3 text-xs", tab === t ? "border border-border/70 bg-card font-semibold text-foreground shadow-xs" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}
            >
              {t === "personal" ? "Personal" : "In-built"}
            </Button>
          ))}
        </div>
        {tab === "personal" && mine.length > 0 && (
          <Button type="button" size="sm" onClick={() => setCreating(true)} className="h-8 gap-1.5 text-xs">
            <Plus className="size-3.5" /> Create new
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 select-text overflow-y-auto px-8 pb-24 pt-4 no-scrollbar">
        {tab === "personal" && mine.length === 0 ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Make your own app</h1>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">Tell the agent what you want to make, and it builds an app you can open any time.</p>
            </div>
            {createButton}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {(tab === "personal" ? mine : system).map((a) => (
              <Tile key={a.id} spec={a} onOpen={() => open(a)} />
            ))}
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
