import * as React from "react"
import { Box, Building2, Camera, Check, Clapperboard, Clock, Coins, Cpu, FileText, Film, ImageIcon, Layers, MapPin, Scissors, Tag, Trash2, User, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { loadBrands } from "@/lib/brand/brand-storage"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useMoney } from "@/lib/currency/currency"
import { usageLedger } from "@/lib/ledger/usage-store"
import { CAST_GROUPS } from "./story-cast"
import { STORY_ICONS, storyIcon } from "./story-icons"
import type { CastItem, ShotItem, StoryItem } from "./types"

interface Props {
  story: StoryItem
  onUpdate: (patch: Partial<StoryItem>) => void
  onOpenTab: (tab: "script" | "scene" | "edit") => void
}

/** The titles the cast kinds have on the overview */
const CAST_HEAD: Record<string, { title: string; Icon: LucideIcon }> = {
  Character: { title: "Cast", Icon: User },
  Location: { title: "Locations", Icon: MapPin },
  Props: { title: "Props", Icon: Box },
}

const COST_VIEWS = [
  { id: "all", label: "All" },
  { id: "video", label: "Video" },
  { id: "image", label: "Image" },
] as const

const seconds = (duration: string) => {
  const n = parseFloat(duration)
  return Number.isFinite(n) ? n : 0
}

const clock = (total: number) => `${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")}`

/** A block of the overview: an icon and title, an optional detail under it, an optional action on the right */
function Section({ icon: Icon, title, action, children }: { icon: LucideIcon; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {title}
          </h3>
        </div>
        {action && <div className="flex flex-shrink-0 items-center gap-1.5">{action}</div>}
      </header>
      {children}
    </section>
  )
}

/** One number of the story: its name, the number, and a line of detail where it helps */
function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-secondary/20 p-3.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-card">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        {label}
      </div>
      <div className="min-w-0">
        <div className="text-lg font-semibold tabular-nums text-foreground">{value}</div>
      </div>
    </div>
  )
}

/** A tagged cast item, laid out as on the Cast page: colour, name and role, a short description, and its pictures */
function OverviewRow({ item }: { item: CastItem }) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/10 p-3">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: item.color }} aria-hidden="true" />
        <span className="truncate text-sm font-semibold text-foreground">{item.name}</span>
        {item.role && <span className="truncate text-xs text-muted-foreground">{item.role}</span>}
      </div>
      {item.describe && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.describe}</p>}
      {item.images.length > 0 && (
        <div className="mt-2.5 flex gap-2 overflow-x-auto no-scrollbar">
          {item.images.map((src, i) => (
            <img key={`${item.id}-${i}`} src={src} alt={`${item.name}, picture ${i + 1}`} className="h-16 w-16 flex-shrink-0 rounded-lg border border-border/60 object-cover" />
          ))}
        </div>
      )}
    </div>
  )
}

/** One colour for each model in the usage bar and list (in order of use) */
const MODEL_COLORS = ["#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#F43F5E", "#06B6D4", "#A3E635", "#EC4899"] // allow-color

/**
 * The first page of a story, laid out like a profile: a wide cover across the top, the logo sitting over its
 * lower edge beside the name, and below it the blocks that say where the story stands.
 */
export function StoryOverview({ story, onUpdate, onOpenTab }: Props) {
  const brandKits = React.useMemo(() => loadBrands(), [])
  const Icon = storyIcon(story.icon)
  const money = useMoney().format
  // Total cost, or the video or image part of it
  const [costView, setCostView] = React.useState<(typeof COST_VIEWS)[number]["id"]>("all")
  // The ledger changes as generations run: this page follows it
  const [, refresh] = React.useState(0)
  React.useEffect(() => usageLedger.subscribe(() => refresh((n) => n + 1)), [])
  // Usage is for every generation in the app: the ledger does not tag a generation with its story yet
  const spend = usageLedger.getSpendOverview("all")
  const shots = story.scenes.flatMap((sc) => sc.shots)
  const made = (sh: ShotItem) => sh.generatedSlots.filter((slot) => slot.url)
  const videos = shots.filter((sh) => sh.mode === "video").reduce((n, sh) => n + made(sh).length, 0)
  const images = shots.filter((sh) => sh.mode === "image").reduce((n, sh) => n + made(sh).length, 0)
  const runtime = shots.reduce((sum, sh) => sum + seconds(sh.duration), 0)
  const videoTakes = story.scenes.flatMap((sc) =>
    sc.shots
      .filter((sh) => sh.mode === "video")
      .flatMap((sh) => made(sh).map((slot, i) => ({ url: slot.url!, label: `S${sc.sceneNumber} · B${sh.shotNumber} · take ${i + 1}` }))),
  )
  const takes = shots.flatMap((sh) => made(sh)).map((slot) => slot.url!)
  const picks = takes.filter((url, i, all) => all.indexOf(url) === i)
  const cover = story.cover ?? picks[0]
  const accents = story.scenes.map((sc) => sc.color).slice(0, 3)
  // Beats per model, most used first
  const modelUse = [...shots.reduce((m, sh) => m.set(sh.model, (m.get(sh.model) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])
  // The cast tagged for the overview, in the three usual kinds and any others that have tagged items
  const cast = story.cast ?? []
  // Every kind of cast on the page, the usual three and any the user added
  const castKinds = story.castGroups ?? CAST_GROUPS
  // Popups: the video chooser, and the cast chooser for one kind
  const [pickVideo, setPickVideo] = React.useState(false)
  const [chooseKind, setChooseKind] = React.useState<string | null>(null)
  const costTotal = spend.totalCostUsd
  const videoShare = costTotal > 0 ? (spend.modalities.video.costUsd / costTotal) * 100 : 0
  const costShown = costView === "video" ? spend.modalities.video.costUsd : costView === "image" ? spend.modalities.image.costUsd : costTotal

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar animate-fade-in">
      <div className="mx-auto max-w-5xl px-6 pb-16 pt-4">
        {/* The cover */}
        <div className="group relative h-48 overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-secondary to-card">
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            accents.length > 0 && <div className="h-full w-full opacity-60" style={{ background: `linear-gradient(135deg, ${accents.join(", ")})` }} />
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="secondary" size="sm" className="absolute bottom-3 right-3 h-8 gap-1.5 px-3 text-xs opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100">
                <Camera className="h-3.5 w-3.5" />
                <span>Change cover</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2">
              {picks.length === 0 ? (
                <p className="px-1 py-3 text-xs text-muted-foreground">Make a picture in a beat first. Any of its takes can be the cover.</p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-1.5">
                    {picks.slice(0, 16).map((url) => (
                      <Button key={url} type="button" variant="ghost" onClick={() => onUpdate({ cover: url })} className={cn("aspect-video h-auto overflow-hidden rounded-md border p-0", cover === url ? "border-select" : "border-border/60")}>
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </Button>
                    ))}
                  </div>
                  {story.cover && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => onUpdate({ cover: undefined })} className="mt-2 h-7 w-full gap-1.5 text-xs text-muted-foreground">
                      <Trash2 className="h-3 w-3" />
                      Use the first picture again
                    </Button>
                  )}
                </>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* The logo, the name, and where to go next */}
        <div className="relative z-10 -mt-10 flex flex-wrap items-end gap-4 px-5">
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" aria-label="Change the logo" className="h-20 w-20 flex-shrink-0 rounded-full border-4 border-background bg-card p-0 text-foreground shadow-md hover:bg-card">
                <Icon className="h-8 w-8" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-2">
              <div className="grid grid-cols-6 gap-1">
                {Object.entries(STORY_ICONS).map(([key, Glyph]) => (
                  <Button key={key} type="button" variant="ghost" aria-label={key} onClick={() => onUpdate({ icon: key })} className={cn("h-8 w-full rounded-md border p-0", story.icon === key ? "border-select/60 bg-select/10" : "border-transparent text-muted-foreground")}>
                    <Glyph className="h-4 w-4" />
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <div className="min-w-0 flex-1 space-y-1 pb-1">
            <Input value={story.title} onChange={(e) => onUpdate({ title: e.target.value })} aria-label="Story name" className="h-9 border-transparent bg-transparent px-1 text-xl font-bold hover:border-border/60" />
            <Input value={story.genre} onChange={(e) => onUpdate({ genre: e.target.value })} placeholder="Add a genre" aria-label="Genre" className="h-6 w-56 border-transparent bg-transparent px-1 font-mono text-xs text-muted-foreground hover:border-border/60" />
          </div>

          <div className="flex flex-wrap items-center gap-2 pb-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => onOpenTab("script")} className="h-8 gap-1.5 text-xs">
              <FileText className="h-3.5 w-3.5" />
              Script
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => onOpenTab("scene")} className="h-8 gap-1.5 text-xs">
              <Clapperboard className="h-3.5 w-3.5" />
              Scenes
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => onOpenTab("edit")} className="h-8 gap-1.5 text-xs">
              <Scissors className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {/* About */}
          <Section icon={FileText} title="About">
            <Textarea
              value={story.logline}
              onChange={(e) => onUpdate({ logline: e.target.value })}
              placeholder="Who wants what, and what stands in the way."
              aria-label="Premise"
              rows={2}
              className="resize-none rounded-lg border border-border/50 bg-secondary/20 text-xs leading-relaxed"
            />
          </Section>

          {/* The brand this story is made for: the script and edit agents follow its colors, fonts and rules */}
          {brandKits.length > 0 && (
            <Section icon={Building2} title="Brand">
              <Select value={story.brandId ?? "none"} onValueChange={(v) => onUpdate({ brandId: v === "none" ? undefined : v })}>
                <SelectTrigger aria-label="Brand kit for this story" className="h-8 w-full max-w-xs rounded-md bg-secondary px-2 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">No brand</SelectItem>
                  {brandKits.map((k) => (
                    <SelectItem key={k.id} value={k.id} className="text-xs">
                      {k.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-muted-foreground">The script and edit agents keep its tone, colors, fonts and rules.</p>
            </Section>
          )}

          {/* The story in numbers */}
          <Section icon={Layers} title="At a glance">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat icon={Clapperboard} label="Scenes" value={story.scenes.length} />
              <Stat icon={Layers} label="Beats" value={shots.length} />
              <Stat icon={Clock} label="Runtime" value={clock(runtime)} />
              <Stat icon={Film} label="Videos" value={videos} />
              <Stat icon={ImageIcon} label="Images" value={images} />
            </div>
          </Section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Total cost: one number, with All, Video and Image to choose from */}
            <Section
              icon={Coins}
              title="Total cost"
              action={
                <div role="group" aria-label="Show cost for" className="flex items-center rounded-lg border border-border/70 bg-secondary/40 p-0.5">
                  {COST_VIEWS.map((v) => (
                    <Button
                      key={v.id}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCostView(v.id)}
                      aria-pressed={costView === v.id}
                      className={cn("h-6 rounded-md px-2 text-xs", costView === v.id ? "bg-card font-semibold text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
                    >
                      {v.label}
                    </Button>
                  ))}
                </div>
              }
            >
              <div className="text-2xl font-semibold tabular-nums text-foreground">{money(costShown)}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {spend.totalGenerations} {spend.totalGenerations === 1 ? "generation" : "generations"}
              </div>
              <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                <div className="h-full bg-foreground/70" style={{ width: `${videoShare}%` }} />
                <div className="h-full bg-foreground/30" style={{ width: `${100 - videoShare}%` }} />
              </div>
              <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-foreground/70" aria-hidden="true" />
                  Video {money(spend.modalities.video.costUsd)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-foreground/30" aria-hidden="true" />
                  Image {money(spend.modalities.image.costUsd)}
                </span>
              </div>
            </Section>

            {/* Model usage: every model used in the beats, with its colour and share */}
            <Section icon={Cpu} title="Model usage">
              {modelUse.length === 0 ? (
                <p className="text-xs text-muted-foreground">No beats yet</p>
              ) : (
                <>
                  <div className="flex h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                    {modelUse.map(([name, count], i) => (
                      <div key={name} className="h-full" title={name} style={{ width: `${(count / shots.length) * 100}%`, background: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                    ))}
                  </div>
                  <ul className="mt-4 space-y-2.5">
                    {modelUse.map(([name, count], i) => (
                      <li key={name} className="flex items-center gap-3 text-xs">
                        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-foreground">{name}</span>
                        <span className="font-mono text-muted-foreground">
                          {count} {count === 1 ? "beat" : "beats"}
                        </span>
                        <span className="w-12 text-right font-mono font-semibold tabular-nums text-foreground">{Math.round((count / shots.length) * 100)}%</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Section>
          </div>

          {/* The final video: chosen from the videos made in the beats, in a popup */}
          <Section
            icon={Film}
            title="Final video"
            action={
              <>
                {story.finalVideo && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onUpdate({ finalVideo: undefined })} className="h-7 gap-1.5 px-2 text-xs text-muted-foreground">
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                )}
                <Button type="button" variant="secondary" size="sm" onClick={() => setPickVideo(true)} className="h-7 gap-1.5 px-2.5 text-xs">
                  <Film className="h-3.5 w-3.5" />
                  {story.finalVideo ? "Change" : "Choose a video"}
                </Button>
              </>
            }
          >
            {story.finalVideo ? (
              <video src={story.finalVideo} controls className="max-h-[28rem] w-full rounded-xl bg-black" aria-label="Final video" />
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 text-xs text-muted-foreground">
                <Film className="h-5 w-5 text-muted-foreground/50" aria-hidden="true" />
                No final video yet
              </div>
            )}
          </Section>
          <Dialog open={pickVideo} onOpenChange={setPickVideo}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Choose the final video</DialogTitle>
              </DialogHeader>
              {videoTakes.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No videos yet</p>
              ) : (
                <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto md:grid-cols-3">
                  {videoTakes.map((take) => (
                    <Button
                      key={take.url}
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        onUpdate({ finalVideo: take.url })
                        setPickVideo(false)
                      }}
                      aria-pressed={story.finalVideo === take.url}
                      className={cn("h-auto flex-col items-stretch gap-0 overflow-hidden rounded-xl border p-0 text-left", story.finalVideo === take.url ? "border-select" : "border-border/60")}
                    >
                      <video src={take.url} muted preload="metadata" className="aspect-video w-full bg-black object-cover" />
                      <span className="px-2.5 py-2 text-xs text-foreground">{take.label}</span>
                    </Button>
                  ))}
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* The final cast, locations and props: one row for each kind, with Choose to tag its items */}
          {castKinds.map((kind) => {
            const head = CAST_HEAD[kind] ?? { title: kind, Icon: Tag }
            const tagged = cast.filter((c) => c.group === kind && c.final)
            return (
              <Section
                key={kind}
                icon={head.Icon}
                title={head.title}
                action={
                  <Button type="button" variant="secondary" size="sm" onClick={() => setChooseKind(kind)} className="h-7 gap-1.5 px-2.5 text-xs">
                    Choose
                  </Button>
                }
              >
                {tagged.length === 0 ? (
                  <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-border/70 text-xs text-muted-foreground">Nothing tagged yet</div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                    {tagged.map((item) => (
                      <OverviewRow key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </Section>
            )
          })}
          <Dialog open={chooseKind !== null} onOpenChange={(open) => !open && setChooseKind(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Choose {(CAST_HEAD[chooseKind ?? ""]?.title ?? chooseKind ?? "").toLowerCase()}</DialogTitle>
              </DialogHeader>
              <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
                {cast.filter((c) => c.group === chooseKind).length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">Nothing here yet</p>
                ) : (
                  cast
                    .filter((c) => c.group === chooseKind)
                    .map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant="ghost"
                        onClick={() => onUpdate({ cast: cast.map((c) => (c.id === item.id ? { ...c, final: !c.final } : c)) })}
                        aria-pressed={Boolean(item.final)}
                        className={cn("h-auto w-full justify-start gap-3 rounded-xl border px-3 py-2.5", item.final ? "border-select/60 bg-select/10" : "border-border/60")}
                      >
                        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: item.color }} aria-hidden="true" />
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-sm font-semibold text-foreground">{item.name}</span>
                          {item.role && <span className="block truncate text-xs text-muted-foreground">{item.role}</span>}
                        </span>
                        {item.final && <Check className="h-4 w-4 flex-shrink-0 text-foreground" aria-hidden="true" />}
                      </Button>
                    ))
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  )
}
