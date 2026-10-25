import * as React from "react"
import { Blocks, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Compass, Layers, LifeBuoy, Loader2, MessageSquare, Palette, Play, PlayCircle, Shapes, Sparkles, Wand2, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FormCard, IconTile, Rows } from "@/components/ui/form-rows"
import { TooltipProvider } from "@/components/ui/tooltip"
import { loadBrands } from "@/lib/brand/brand-storage"
import { useElements } from "@/lib/elements/store"
import { fetchBanners, type Banner } from "@/lib/home/banners"
import { FEATURED } from "@/lib/home/courses"
import { getOnboardingSeen, markOnboardingSeen } from "@/lib/home/onboarding"
import { clock, fetchVideos, type Tutorial } from "@/lib/home/tutorials"
import { isLiveProviderReady } from "@/lib/providers/live-connectors"
import { loadStories } from "@/components/story/story-storage"
import { cn } from "@/lib/utils"
import type { MainNavTab, SettingsState } from "@/types"

export interface HomeTarget {
  tab: MainNavTab
  brandTab?: "brand" | "elements"
  /** For the tutorials page: which course and video to open */
  course?: string
  video?: string
}

interface Props {
  settings: SettingsState
  onNavigate: (target: HomeTarget) => void
  onOpenSettings: (tab?: string) => void
}

const PROVIDERS = ["fal", "replicate", "openrouter", "gemini", "openai"] as const
const MAX_VIDEOS = 10

const TOOLS: Array<{ id: string; label: string; text: string; icon: LucideIcon; to: HomeTarget; soon?: boolean }> = [
  { id: "create", label: "Create", text: "Images, video, voice and music", icon: MessageSquare, to: { tab: "chat" } },
  { id: "story", label: "Story", text: "Script, shots and a final cut", icon: Clapperboard, to: { tab: "story" } },
  { id: "library", label: "Library", text: "Everything you made", icon: Layers, to: { tab: "library" } },
  { id: "inspiration", label: "Inspiration", text: "Looks and prompts to start from", icon: Compass, to: { tab: "inspiration" } },
  { id: "brand", label: "Brand kits", text: "Logo, colors, fonts, rules", icon: Palette, to: { tab: "brand", brandTab: "brand" } },
  { id: "elements", label: "Elements", text: "Characters, places, looks", icon: Shapes, to: { tab: "brand", brandTab: "elements" } },
  { id: "apps", label: "Apps", text: "Small tools on your models", icon: Blocks, to: { tab: "apps" }, soon: true },
]

/** The slides at the top: change by themselves every few seconds, dots underneath, paused while the mouse is on it */
function Slides({ onGo }: { onGo: (t: HomeTarget) => void }) {
  const [slides, setSlides] = React.useState<Banner[]>([])
  const [at, setAt] = React.useState(0)
  const [paused, setPaused] = React.useState(false)
  React.useEffect(() => {
    void fetchBanners().then(setSlides)
  }, [])
  React.useEffect(() => {
    if (paused || slides.length < 2) return
    const t = window.setInterval(() => setAt((i) => (i + 1) % slides.length), 5000)
    return () => window.clearInterval(t)
  }, [paused, slides.length])
  if (slides.length === 0) return <div className="h-36 rounded-2xl border border-border/70 bg-card" />
  return (
    <section className="relative h-36 overflow-hidden rounded-2xl border border-border/70 bg-card" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-roledescription="carousel">
      {slides.map((s, i) => (
        <div key={s.id} aria-hidden={i !== at} className={cn("absolute inset-0 flex items-center gap-5 px-6 pb-6 transition-opacity duration-500", i === at ? "opacity-100" : "pointer-events-none opacity-0")}>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 className="truncate text-lg font-bold leading-tight text-foreground">{s.title}</h2>
            <p className="line-clamp-2 max-w-md text-xs leading-relaxed text-muted-foreground">{s.text}</p>
            <Button type="button" size="sm" onClick={() => onGo(s.go)} className="mt-1 h-8 gap-1.5 rounded-lg px-4 text-xs font-semibold">
              {s.action}
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <img src={`/home/dark/${s.image}`} alt="" className="hidden h-20 w-32 shrink-0 rounded-xl border border-border object-cover shadow-md dark:block" />
          <img src={`/home/light/${s.image}`} alt="" className="h-20 w-32 shrink-0 rounded-xl border border-border object-cover shadow-md dark:hidden" />
        </div>
      ))}
      <div className="absolute inset-x-0 bottom-2.5 flex items-center justify-center gap-1.5">
        {slides.map((s, i) => (
          <Button key={s.id} type="button" variant="ghost" size="icon" aria-label={`Slide ${i + 1}`} aria-current={i === at} onClick={() => setAt(i)} className={cn("h-1.5 rounded-full p-0 transition-all hover:bg-foreground/60", i === at ? "w-5 bg-foreground" : "w-1.5 bg-foreground/30")} />
        ))}
      </div>
    </section>
  )
}

/** A ring that is full with a tick when the step is done, and shows the step number when it is not */
function Ring({ done, n }: { done: boolean; n: number }) {
  const r = 13
  const c = 2 * Math.PI * r
  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" className="stroke-border" />
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={done ? 0 : c} className="stroke-primary transition-all duration-500" />
      </svg>
      {done ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="text-xs font-semibold text-muted-foreground">{n}</span>}
    </span>
  )
}

function Onboarding({ settings, onNavigate, onOpenSettings }: Props) {
  const [open, setOpen] = React.useState(true)
  const elements = useElements().filter((e) => e.origin !== "preset")
  const brands = React.useMemo(() => loadBrands().length, [])
  const stories = React.useMemo(() => loadStories().length, [])
  const [seenGeneral, setSeenGeneral] = React.useState(() => getOnboardingSeen("general"))
  const hasProvider = PROVIDERS.some((p) => isLiveProviderReady(p, settings))

  const steps = [
    { title: "Add Provider", text: "Paste an API key from fal, Replicate, OpenRouter, Gemini or OpenAI.", done: hasProvider, action: "Add", run: () => onOpenSettings("providers") },
    {
      title: "Set Up General Options",
      text: "Where results are saved, your currency and how the app looks.",
      done: seenGeneral,
      action: "Set up",
      run: () => {
        markOnboardingSeen("general")
        setSeenGeneral(true)
        onOpenSettings("general")
      },
    },
    { title: "Create Brand", text: "Make a kit from a website, or add a logo and name.", done: brands > 0, action: "Create", run: () => onNavigate({ tab: "brand", brandTab: "brand" }) },
    { title: "Add Elements", text: "Save a character, place, product or look to reuse.", done: elements.length > 0, action: "Add", run: () => onNavigate({ tab: "brand", brandTab: "elements" }) },
    { title: "Create a Story", text: "Turn an idea into scenes and shots, then cut them.", done: stories > 0, action: "Create", run: () => onNavigate({ tab: "story" }) },
  ]
  const finished = steps.filter((s) => s.done).length

  return (
    <FormCard
      icon={Sparkles}
      title="Get started"
      hint={`${finished} of ${steps.length} done`}
      action={
        <div className="flex items-center gap-3">
          <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-secondary sm:block">
            <span className="block h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(finished / steps.length) * 100}%` }} />
          </span>
          <Button type="button" variant="ghost" size="icon" aria-label={open ? "Collapse" : "Expand"} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="h-7 w-7 rounded-lg p-0 text-muted-foreground hover:text-foreground">
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </Button>
        </div>
      }
      bare
      hidden={!open}
    >
      <Rows>
        {steps.map((s, i) => (
          <div key={s.title} className="flex items-center gap-3 px-4 py-2.5">
            <Ring done={s.done} n={i + 1} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">{s.title}</p>
              <p className="truncate text-xs text-muted-foreground">{s.text}</p>
            </div>
            <Button type="button" variant={s.done ? "ghost" : "default"} size="sm" onClick={s.run} className={cn("h-7 shrink-0 px-3 text-xs font-semibold", s.done && "border border-border/70 text-muted-foreground hover:text-foreground")}>
              {s.done ? "Review" : s.action}
            </Button>
          </div>
        ))}
      </Rows>
    </FormCard>
  )
}

/** One row of video pictures with a title each: ten at most, then a Show more card */
function Tutorials({ onGo }: { onGo: (t: HomeTarget) => void }) {
  const [list, setList] = React.useState<Tutorial[] | null>(null)
  const [error, setError] = React.useState("")
  const row = React.useRef<HTMLDivElement>(null)

  const load = React.useCallback((force = false) => {
    setList(null)
    setError("")
    fetchVideos(FEATURED.query, MAX_VIDEOS, force)
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  React.useEffect(() => load(), [load])

  const scroll = (dir: -1 | 1) => row.current?.scrollBy({ left: dir * (row.current.clientWidth * 0.8), behavior: "smooth" })

  return (
    <FormCard
      icon={PlayCircle}
      title="Tutorials"
      hint="Short videos to get you going"
      bare
      action={
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label="Scroll left" onClick={() => scroll(-1)} className="h-7 w-7 rounded-lg p-0 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Scroll right" onClick={() => scroll(1)} className="h-7 w-7 rounded-lg p-0 text-muted-foreground hover:text-foreground">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <div ref={row} className="flex snap-x gap-3 overflow-x-auto p-4 no-scrollbar">
        {list === null && !error && (
          <div className="flex h-24 w-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading videos
          </div>
        )}
        {error && (
          <div className="flex h-24 w-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-xs text-muted-foreground">Could not load the videos. {error}</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => load(true)} className="h-7 text-xs">
              Try again
            </Button>
          </div>
        )}
        {list?.map((t) => (
          <Button key={t.id} type="button" variant="ghost" onClick={() => onGo({ tab: "tutorials", course: FEATURED.id, video: t.id })} className="group/card flex h-auto w-40 shrink-0 snap-start flex-col items-stretch justify-start gap-1.5 whitespace-normal p-0 text-left font-normal hover:bg-transparent">
            <span className="relative block aspect-video overflow-hidden rounded-lg border border-border/60 bg-secondary/40">
              <img src={t.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover/card:scale-105" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/card:bg-black/30">
                <Play className="h-5 w-5 text-white opacity-0 transition-opacity group-hover/card:opacity-100" />
              </span>
              <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 font-mono text-xs text-white">{clock(t.seconds)}</span>
            </span>
            <span className="line-clamp-2 text-xs font-medium leading-snug text-foreground">{t.title}</span>
          </Button>
        ))}
        {list && list.length > 0 && (
          <Button type="button" variant="ghost" onClick={() => onGo({ tab: "tutorials" })} className="flex aspect-video h-auto w-40 shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-secondary/20 text-xs font-semibold text-foreground hover:bg-secondary/50">
            <ChevronRight className="h-4 w-4" />
            Show more
          </Button>
        )}
      </div>
    </FormCard>
  )
}

export function HomeView(props: Props) {
  const go = props.onNavigate

  return (
    <TooltipProvider delayDuration={150}>
      <div className="h-full w-full overflow-y-auto px-6 pb-24 pt-4 no-scrollbar">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <Slides onGo={go} />

          <Onboarding {...props} />

          <Tutorials onGo={go} />

          <FormCard icon={Wand2} title="AI tools" hint="Everything in the studio" bare>
            <div className="grid grid-cols-4 gap-2 p-3">
              {TOOLS.map((t) => (
                <Button key={t.id} type="button" variant="ghost" onClick={() => go(t.to)} className="flex h-auto flex-col items-start justify-start gap-2 whitespace-normal rounded-xl border border-border/60 bg-secondary/20 p-3 text-left font-normal hover:bg-secondary/50">
                  <IconTile icon={t.icon} className="h-8 w-8" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      {t.label}
                      {t.soon && <span className="rounded bg-primary/20 px-1 font-mono text-xs font-normal text-primary">Soon</span>}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">{t.text}</span>
                  </span>
                </Button>
              ))}
            </div>
          </FormCard>

          <FormCard icon={LifeBuoy} title="Support resources" hint="Help when you need it" bare>
            <div className="grid grid-cols-3 divide-x divide-border/60">
              {(
                [
                  { icon: LifeBuoy, title: "Support", text: "Get help from a person", to: { tab: "support" } },
                  { icon: BookOpen, title: "Documentation", text: "Guides for every tool", to: { tab: "docs" } },
                  { icon: PlayCircle, title: "Tutorials", text: "Courses, basic to advanced", to: { tab: "tutorials" } },
                ] as const
              ).map((c) => (
                <Button key={c.title} type="button" variant="ghost" onClick={() => go({ tab: c.to.tab })} className="flex h-auto items-center justify-start gap-3 whitespace-normal rounded-none p-4 text-left font-normal hover:bg-secondary/30">
                  <IconTile icon={c.icon} />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-foreground">{c.title}</span>
                    <span className="block text-xs leading-snug text-muted-foreground">{c.text}</span>
                  </span>
                </Button>
              ))}
            </div>
          </FormCard>
        </div>
      </div>
    </TooltipProvider>
  )
}
