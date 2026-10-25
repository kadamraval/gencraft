import * as React from "react"
import { gridClass, masonryClass } from "@/components/library/layout-classes"
import type { CardSizeStep, LayoutMode } from "@/types"
import { cn } from "@/lib/utils"

/** Runs an async read, keeps the result, and offers a reload. `deps` decide when it runs again. */
export function useLoad<T>(run: (() => Promise<T>) | null, deps: React.DependencyList): { data: T | undefined; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = React.useState<T | undefined>()
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    if (!run) return
    let alive = true
    setLoading(true)
    setError(null)
    run().then(
      (d) => {
        if (!alive) return
        setData(d)
        setLoading(false)
      },
      (e: unknown) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      },
    )
    return () => {
      alive = false
    }
  }, [...deps, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  return { data, loading, error, reload: () => setTick((t) => t + 1) }
}

/** Where the header's View choice lands: the same layout and card size as the Library. */
export interface ViewProps {
  layoutMode: LayoutMode
  cardSizeStep: CardSizeStep
}

export function PinGrid({ view, children }: { view: ViewProps; children: React.ReactNode }) {
  return <div className={view.layoutMode === "masonry" ? masonryClass(view.cardSizeStep) : cn("grid items-start", gridClass(view.cardSizeStep))}>{children}</div>
}

export function Skeletons({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-secondary/60" />
      ))}
    </div>
  )
}
