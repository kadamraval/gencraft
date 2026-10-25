import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The blank state for a whole page: an icon tile, the name, one line, and a row of three small step cards that
 * lean a little and straighten when touched. Used wherever a page has nothing to show yet, so they all look
 * alike. Each page supplies only its words and its icon.
 */
export interface BlankStateProps {
  /** A picture from public/home (for example "01_image.png") or a plain icon */
  art: { image: string } | { icon: LucideIcon }
  title: string
  line: string
  steps: Array<{ icon: LucideIcon; title: string; text: string }>
  /** A button under the cards, when the page needs one */
  action?: React.ReactNode
  /** Inside a panel rather than a full page: no minimum height */
  compact?: boolean
}

const LEAN = ["-rotate-2", "rotate-1", "-rotate-1"]

function ArtTile({ art }: { art: BlankStateProps["art"] }) {
  const tile = "h-20 w-20 rounded-2xl border border-border shadow-lg transition-transform duration-500 hover:-rotate-6 hover:scale-105"
  if ("icon" in art) {
    const Icon = art.icon
    return (
      <span className={cn(tile, "flex items-center justify-center bg-card text-foreground")}>
        <Icon className="h-9 w-9" />
      </span>
    )
  }
  return (
    <>
      <img src={`/home/dark/${art.image}`} alt="" className={cn(tile, "hidden object-cover dark:block")} />
      <img src={`/home/light/${art.image}`} alt="" className={cn(tile, "object-cover dark:hidden")} />
    </>
  )
}

export function BlankState({ art, title, line, steps, action, compact }: BlankStateProps) {
  return (
    <div className={cn("mx-auto flex max-w-2xl flex-col items-center justify-center gap-4 text-center", compact ? "py-6" : "min-h-[50vh]")}>
      <ArtTile art={art} />
      <div className="space-y-0.5">
        <h2 className="text-lg font-semibold leading-tight text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{line}</p>
      </div>

      <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-3">
        {steps.map((s, i) => {
          const Icon = s.icon
          return (
            <div
              key={s.title}
              className={cn(
                "group relative rounded-xl border border-border bg-card p-3 text-left transition-all duration-300 hover:-translate-y-1 hover:rotate-0 hover:shadow-lg",
                LEAN[i % LEAN.length],
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-foreground transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="font-mono text-xs text-muted-foreground/60">0{i + 1}</span>
              </div>
              <p className="text-xs font-medium text-foreground">{s.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.text}</p>
            </div>
          )
        })}
      </div>
      {action}
    </div>
  )
}
