import * as React from "react"
import { Clock, Film, Image as ImageIcon, Music } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ErrorNotice } from "@/components/ui/error-notice"
import { cancelQueued, describePlace, useQueuePosition } from "@/lib/run-queue"
import type { GenerationJob } from "@/types"
import { cn } from "@/lib/utils"

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`

const LABEL: Record<GenerationJob["kind"], string> = { chat: "Thinking", image: "Generating", video: "Generating video", audio: "Generating audio" }

function ratioOf(aspect: string | undefined): number {
  const m = aspect?.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/)
  return m ? Number(m[1]) / Number(m[2]) : 1
}

/**
 * What the chat shows while a model works, and when it fails. Chat is three quiet dots; image, video and audio
 * are placeholders the size of the result with the time so far. The expected time appears only once this model
 * has been used before, because providers publish none.
 */
export function GenerationCard({ job, runId, onOpenSettings, onRetry }: { job: GenerationJob; /** The message this card belongs to, so a waiting run can show its place and be cancelled */ runId?: string; onOpenSettings?: () => void; onRetry?: () => void }) {
  const place = useQueuePosition(runId ?? "")
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (job.status !== "running") return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [job.status])

  if (job.status === "queued") {
    return (
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span>
          Waiting for a free place{job.modelName ? ` to use ${job.modelName}` : ""} · {describePlace(place)}
        </span>
        {runId && (
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => cancelQueued(runId)}>
            Cancel
          </Button>
        )}
      </div>
    )
  }

  if (job.status === "failed") {
    return (
      <div className="mt-2 max-w-md">
        <ErrorNotice info={job.errorInfo} fallbackTitle={job.kind === "chat" ? "The reply failed" : `The ${job.kind} did not generate`} message={job.error} onOpenSettings={onOpenSettings} onRetry={onRetry} />
      </div>
    )
  }

  const elapsed = Math.max(0, (now - job.startedAt) / 1000)

  if (job.kind === "chat") {
    return (
      <div className="mt-1 flex items-center gap-1" aria-label="Thinking">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 200}ms` }} />
        ))}
      </div>
    )
  }

  const expected = job.expected ? job.expected.seconds * (job.kind === "video" ? job.count : 1) : undefined
  const progress = expected ? Math.min(0.95, elapsed / expected) : undefined
  const Icon = job.kind === "image" ? ImageIcon : job.kind === "video" ? Film : Music
  const ratio = job.kind === "audio" ? 6 : job.kind === "video" ? ratioOf(job.aspectRatio) || 16 / 9 : ratioOf(job.aspectRatio)

  return (
    <div className="mt-2 space-y-2">
      <div className={cn("grid gap-2", job.kind === "audio" ? "grid-cols-1" : job.count > 1 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:max-w-xs")}>
        {Array.from({ length: Math.max(1, job.count) }, (_, i) => (
          <div key={i} className="relative flex animate-pulse items-center justify-center overflow-hidden rounded-lg border border-border/40 bg-secondary/60" style={{ aspectRatio: String(ratio) }}>
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {progress !== undefined && (
          <div className="h-1 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-foreground/60 transition-all duration-500" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {LABEL[job.kind]}
          {job.modelName ? ` with ${job.modelName}` : ""} · {clock(elapsed)}
          {job.expected
            ? ` · about ${clock(expected!)}, from your last ${job.expected.runs} run${job.expected.runs === 1 ? "" : "s"}`
            : " · timing appears after the first run with this model"}
        </div>
      </div>
    </div>
  )
}
