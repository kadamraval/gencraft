import { ArrowLeft, Upload } from "lucide-react"
import * as React from "react"
import { AiToolPanel } from "@/components/ai-tools/ai-tool-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import type { MediaAsset, SettingsState } from "@/types"
import { cn } from "@/lib/utils"

type Kind = "image" | "video" | "audio"

interface Props {
  kind: Kind
  settings: SettingsState
  assets: MediaAsset[]
  projectId?: string
  onBack: () => void
  onAssets: (assets: MediaAsset[]) => void
  onOpenSettings?: (tab?: string) => void
  /** The Edit option to open straight away, when an app card is that one option */
  tool?: string
  /** The page title; the kind's own title when missing */
  title?: string
  /** A file to start with (a picture sent here from its popup) */
  file?: { url: string; name: string }
}

const TITLE: Record<Kind, string> = { image: "Edit a picture", video: "Edit a video", audio: "Edit a sound" }
const ACCEPT: Record<Kind, string> = { image: "image/*", video: "video/*", audio: "audio/*" }

/**
 * The Edit app of a category on the Apps page: choose a file from the Library or upload one, then every edit the person's models can do
 * runs on it. It is the same edit panel the result popup, the Library and the timeline editor open, here with a file picker beside it.
 */
export function EditApp({ kind, settings, assets, projectId, onBack, onAssets, onOpenSettings, tool, title, file }: Props) {
  const files = React.useMemo(() => assets.filter((a) => a.type === kind && a.url && a.status !== "failed").slice(0, 60), [assets, kind])
  const [chosen, setChosen] = React.useState<{ url: string; name: string } | null>(file ?? null)
  const input = React.useRef<HTMLInputElement>(null)

  const upload = (file: File | undefined) => {
    if (!file) return
    setChosen({ url: URL.createObjectURL(file), name: file.name })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-6 pb-2 pt-5">
        <Button type="button" variant="ghost" size="icon" aria-label="Back to apps" onClick={onBack} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-sm font-semibold text-foreground">{title ?? TITLE[kind]}</h1>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 px-6 pb-6 md:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex min-h-[14rem] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-border bg-secondary/40">
            {chosen ? (
              kind === "image" ? (
                <img src={chosen.url} alt={chosen.name} className="max-h-full max-w-full object-contain" />
              ) : kind === "video" ? (
                <video src={chosen.url} controls className="max-h-full max-w-full" />
              ) : (
                <audio src={chosen.url} controls className="w-3/4" />
              )
            ) : (
              <EmptyState icon={Upload} title="Choose a file" hint="Pick one from your Library below, or upload one." />
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">From your Library</span>
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => input.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Upload
            </Button>
            <Input ref={input} type="file" accept={ACCEPT[kind]} className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          </div>
          {files.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing of this kind in your Library yet.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {files.map((a) => (
                <Button
                  key={a.id}
                  type="button"
                  variant="ghost"
                  aria-label={`Use ${a.title}`}
                  onClick={() => setChosen({ url: a.url, name: a.title })}
                  className={cn("h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg border bg-secondary/40 p-0 text-xs text-muted-foreground", chosen?.url === a.url ? "border-foreground" : "border-border")}
                >
                  {kind === "image" || a.thumbnailUrl ? <img src={kind === "image" ? a.url : a.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <span className="line-clamp-2 px-1">{a.title}</span>}
                </Button>
              ))}
            </div>
          )}
        </div>
        <div className="min-h-0 overflow-y-auto">
          <AiToolPanel
            media={chosen ? { url: chosen.url, kind, name: chosen.name } : null}
            kind={kind}
            surface="apps"
            settings={settings}
            projectId={projectId}
            onOpenSettings={() => onOpenSettings?.("providers")}
            onDone={(made) => onAssets(made)}
            startWith={tool}
          />
        </div>
      </div>
    </div>
  )
}
