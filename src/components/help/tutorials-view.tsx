import * as React from "react"
import { ArrowLeft, Briefcase, Check, CheckCircle2, ChevronRight, Clapperboard, Film, GraduationCap, ImageIcon, ListVideo, Loader2, MessageSquare, Play, SkipForward, Star, Trash2, User, Wand2, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FormCard, TEXT_BOX } from "@/components/ui/form-rows"
import { Textarea } from "@/components/ui/textarea"
import { FEATURED, LEVELS, courseById, fetchCourses, type Course } from "@/lib/home/courses"
import { addComment, removeComment, setDone, useComments, useDone } from "@/lib/home/progress"
import { clock, embedUrl, fetchVideos, type Tutorial } from "@/lib/home/tutorials"
import { cn } from "@/lib/utils"

interface Props {
  /** Open straight into a course (and a video in it), for example from Home */
  initial?: { course?: string; video?: string }
}

const ago = (t: number) => {
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`
  return `${Math.round(mins / 1440)} d ago`
}

/** Loads a course's videos. `null` while loading, with the error text if it failed. */
function useCourseVideos(course: Course | undefined) {
  const [state, setState] = React.useState<{ list: Tutorial[] | null; error: string }>({ list: null, error: "" })
  const load = React.useCallback(
    (force = false) => {
      if (!course) return
      setState({ list: null, error: "" })
      fetchVideos(course.query, 12, force)
        .then((list) => setState({ list, error: "" }))
        .catch((e) => setState({ list: null, error: e instanceof Error ? e.message : String(e) }))
    },
    [course],
  )
  React.useEffect(() => load(), [load])
  return { ...state, reload: () => load(true) }
}

/** Soft colors for the course cards: the panel, the petals drawn on it and the icon. Each course keeps the same one, picked from its id. */
const PETALS = [
  { panel: "bg-rose-500/10", petal: "bg-rose-500/20", icon: "text-rose-500" },
  { panel: "bg-amber-500/10", petal: "bg-amber-500/20", icon: "text-amber-500" },
  { panel: "bg-emerald-500/10", petal: "bg-emerald-500/20", icon: "text-emerald-500" },
  { panel: "bg-sky-500/10", petal: "bg-sky-500/20", icon: "text-sky-500" },
  { panel: "bg-violet-500/10", petal: "bg-violet-500/20", icon: "text-violet-500" },
  { panel: "bg-fuchsia-500/10", petal: "bg-fuchsia-500/20", icon: "text-fuchsia-500" },
  { panel: "bg-orange-500/10", petal: "bg-orange-500/20", icon: "text-orange-500" },
  { panel: "bg-teal-500/10", petal: "bg-teal-500/20", icon: "text-teal-500" },
]
const ICONS: Record<string, LucideIcon> = { image: ImageIcon, video: Clapperboard, wand: Wand2, user: User, film: Film, briefcase: Briefcase, star: Star }
const petal = (id: string) => PETALS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % PETALS.length]!

/** One course as a single card: a petal-colored panel with the icon and the level badge at its top right, then the title and a short line */
function CourseCard({ course, onOpen }: { course: Course; onOpen: () => void }) {
  const Icon = ICONS[course.icon] ?? GraduationCap
  const color = petal(course.id)
  return (
    <Button type="button" variant="ghost" onClick={onOpen} className="group/card flex h-auto flex-col items-stretch justify-start gap-0 overflow-hidden whitespace-normal rounded-2xl border border-border/70 bg-card p-0 text-left font-normal transition-all hover:-translate-y-0.5 hover:bg-card hover:shadow-lg">
      <span className={cn("relative flex h-24 items-center justify-center overflow-hidden", color.panel)}>
        <span className={cn("absolute -left-4 -top-4 h-16 w-16 rotate-12 rounded-br-3xl rounded-tl-3xl rounded-bl-lg rounded-tr-lg transition-transform duration-500 group-hover/card:rotate-45", color.petal)} />
        <span className={cn("absolute -bottom-5 left-1/4 h-14 w-14 -rotate-12 rounded-br-3xl rounded-tl-3xl rounded-bl-lg rounded-tr-lg transition-transform duration-500 group-hover/card:-rotate-45", color.petal)} />
        <span className={cn("absolute -bottom-4 -right-3 h-20 w-20 rotate-45 rounded-br-3xl rounded-tl-3xl rounded-bl-lg rounded-tr-lg transition-transform duration-500 group-hover/card:rotate-12", color.petal)} />
        <Icon className={cn("relative h-8 w-8", color.icon)} />
        <span className="absolute right-2 top-2 rounded-full border border-border/60 bg-card/90 px-2 py-0.5 text-xs font-medium text-foreground">{LEVELS.find((l) => l.id === course.level)?.label}</span>
      </span>
      <span className="block space-y-0.5 p-3">
        <span className="block text-xs font-semibold text-foreground">{course.title}</span>
        <span className="line-clamp-2 block text-xs leading-snug text-muted-foreground">{course.text}</span>
      </span>
    </Button>
  )
}

/** The page before a course is opened: every course is one card, in order from basic to advanced */
function Landing({ onOpen }: { onOpen: (course: string) => void }) {
  const [courses, setCourses] = React.useState<Course[]>([])
  React.useEffect(() => {
    void fetchCourses().then(setCourses)
  }, [])
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {courses.map((c) => (
          <CourseCard key={c.id} course={c} onOpen={() => onOpen(c.id)} />
        ))}
      </div>
    </div>
  )
}

function Comments({ videoId }: { videoId: string }) {
  const comments = useComments(videoId)
  const [text, setText] = React.useState("")
  const post = () => {
    if (!text.trim()) return
    addComment(videoId, text)
    setText("")
  }
  return (
    <FormCard icon={MessageSquare} title="Comments" hint="Saved on this device. Sharing with others comes later." bare>
      <div className="space-y-3 p-4">
        <div className="space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && post()} rows={2} placeholder="Add a comment or a note for yourself" aria-label="Add a comment" className={cn("resize-none text-xs", TEXT_BOX)} />
          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={!text.trim()} onClick={post} className="h-8 px-4 text-xs font-semibold">
              Comment
            </Button>
          </div>
        </div>
        {comments.length > 0 && (
          <div className="divide-y divide-border/50 border-t border-border/60">
            {comments.map((c) => (
              <div key={c.id} className="group flex items-start gap-2.5 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">Y</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs">
                    <span className="font-semibold text-foreground">You</span> <span className="text-muted-foreground">· {ago(c.at)}</span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">{c.text}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label="Delete comment" onClick={() => removeComment(videoId, c.id)} className="h-7 w-7 shrink-0 p-0 text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </FormCard>
  )
}

/** A course: the video on the left, every lesson on the right, comments underneath */
function CoursePage({ course, video, onBack }: { course: Course; video?: string; onBack: () => void }) {
  const { list, error, reload } = useCourseVideos(course)
  const done = useDone()
  const [picked, setPicked] = React.useState<string | undefined>(video)
  const current = list?.find((v) => v.id === picked) ?? list?.[0]
  const index = list && current ? list.indexOf(current) : -1
  const finished = list ? list.filter((v) => done.includes(v.id)).length : 0
  const isDone = current ? done.includes(current.id) : false
  const next = list && index >= 0 ? list[index + 1] : undefined

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon" aria-label="Back to tutorials" onClick={onBack} className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            Tutorials <ChevronRight className="inline h-3 w-3" /> {course.id === FEATURED.id ? "Featured" : LEVELS.find((l) => l.id === course.level)?.label}
          </p>
          <h1 className="truncate text-base font-bold leading-tight text-foreground">{course.title}</h1>
        </div>
      </div>

      {error && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
          <p className="text-xs text-muted-foreground">Could not load this course. {error}</p>
          <Button type="button" variant="secondary" size="sm" onClick={reload} className="h-8 text-xs">
            Try again
          </Button>
        </div>
      )}
      {!error && list === null && (
        <div className="flex items-center justify-center gap-2 py-24 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading the course
        </div>
      )}
      {list && list.length === 0 && <p className="py-20 text-center text-xs text-muted-foreground">No lessons found for this course right now.</p>}

      {list && current && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="min-w-0 space-y-4">
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-black">
              <div className="aspect-video w-full">
                <iframe key={current.id} title={current.title} src={embedUrl(current.id)} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="h-full w-full border-0" />
              </div>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug text-foreground">{current.title}</p>
                <p className="text-xs text-muted-foreground">
                  Lesson {index + 1} of {list.length} · {current.channel}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" variant={isDone ? "secondary" : "default"} size="sm" onClick={() => setDone(current.id, !isDone)} className="h-8 gap-1.5 px-3 text-xs font-semibold">
                  <Check className="h-3.5 w-3.5" />
                  {isDone ? "Completed" : "Mark complete"}
                </Button>
                {next && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setPicked(next.id)} className="h-8 gap-1.5 px-3 text-xs font-semibold">
                    Next
                    <SkipForward className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <Comments videoId={current.id} />
          </div>

          <div className="lg:sticky lg:top-0 lg:self-start">
          <FormCard icon={ListVideo} title="Course content" hint={`${finished} of ${list.length} complete`} bare>
            <div className="max-h-[70vh] divide-y divide-border/50 overflow-y-auto no-scrollbar">
              {list.map((v, i) => {
                const on = v.id === current.id
                const finishedOne = done.includes(v.id)
                return (
                  <Button key={v.id} type="button" variant="ghost" onClick={() => setPicked(v.id)} className={cn("flex h-auto w-full items-center justify-start gap-2.5 whitespace-normal rounded-none p-2.5 text-left font-normal hover:bg-secondary/40", on && "bg-secondary/60")}>
                    <span className="relative block aspect-video w-20 shrink-0 overflow-hidden rounded-md border border-border/60 bg-secondary/40">
                      <img src={v.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                      {on && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <Play className="h-4 w-4 text-white" />
                        </span>
                      )}
                      <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 font-mono text-xs text-white">{clock(v.seconds)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-xs font-medium leading-snug text-foreground">
                        {i + 1}. {v.title}
                      </span>
                    </span>
                    {finishedOne && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                  </Button>
                )
              })}
            </div>
          </FormCard>
          </div>
        </div>
      )}
    </div>
  )
}

export function TutorialsView({ initial }: Props) {
  const [open, setOpen] = React.useState<{ course: string; video?: string } | null>(initial?.course ? { course: initial.course, video: initial.video } : null)
  // A new request from outside (for example another card on Home) replaces what is open
  React.useEffect(() => {
    setOpen(initial?.course ? { course: initial.course, video: initial.video } : null)
  }, [initial?.course, initial?.video])
  const course = open ? courseById(open.course) : undefined
  return (
    <div className="h-full w-full overflow-y-auto px-6 pb-24 pt-4 no-scrollbar">{course && open ? <CoursePage key={`${course.id}:${open.video ?? ""}`} course={course} video={open.video} onBack={() => setOpen(null)} /> : <Landing onOpen={(id) => setOpen({ course: id })} />}</div>
  )
}
