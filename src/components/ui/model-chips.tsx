import * as React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getFamily } from "@/lib/registry/store"
import { rowChips, splitChips } from "@/lib/registry/summary"
import type { ModelRecord } from "@/lib/registry/types"
import { cn } from "@/lib/utils"

const CHIP = "flex-shrink-0 whitespace-nowrap rounded-md bg-foreground/10 px-1.5 py-1 text-[11px] leading-none text-foreground/70"
const GAP = 4
/** Room kept for the "+N" badge when some badges do not fit */
const PLUS_WIDTH = 34

function MoreChip({ more }: { more: string[] }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={CHIP}>+{more.length}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {more.join(" · ")}
      </TooltipContent>
    </Tooltip>
  )
}

/** One line of badges that shows as many as the width allows. The rest wait behind "+N". */
function FittedChips({ chips }: { chips: string[] }) {
  const box = React.useRef<HTMLSpanElement>(null)
  const [count, setCount] = React.useState(chips.length)
  const key = chips.join("|")

  React.useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const widths = Array.from(el.querySelectorAll<HTMLElement>("[data-chip]"), (c) => c.offsetWidth)
      let used = 0
      let fits = 0
      for (let i = 0; i < widths.length; i++) {
        const next = used + (fits > 0 ? GAP : 0) + widths[i]!
        const reserve = i < widths.length - 1 ? GAP + PLUS_WIDTH : 0
        if (next + reserve > el.clientWidth) break
        used = next
        fits++
      }
      setCount(fits)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [key])

  return (
    <span ref={box} className="relative flex items-center gap-1 overflow-hidden">
      {chips.map((c, i) => (
        <span key={c} data-chip className={cn(CHIP, i >= count && "invisible absolute")}>
          {c}
        </span>
      ))}
      {count < chips.length && <MoreChip more={chips.slice(count)} />}
    </span>
  )
}

/**
 * Under a model's name: where it lives (provider/model), then one line of small badges, the most important
 * first. What does not fit waits behind a "+N" that shows the rest on hover. With `fit`, the badges are fitted
 * to the width they are given; otherwise at most five are shown.
 */
export function ModelChips({ model, showId = true, fit = false }: { model: ModelRecord; /** The provider/model line above the badges */ showId?: boolean; /** Show as many badges as the width allows */ fit?: boolean }) {
  const all = rowChips(model, getFamily(model))
  const { shown, more } = splitChips(all)
  return (
    <span className={showId ? "mt-0.5 block space-y-1.5" : "block"}>
      {showId && <span className="block truncate font-mono text-[10px] leading-tight text-muted-foreground/70">{model.id}</span>}
      {fit ? (
        all.length > 0 && <FittedChips chips={all} />
      ) : (
        shown.length > 0 && (
          <span className="flex items-center gap-1 overflow-hidden">
            {shown.map((c) => (
              <span key={c} className={CHIP}>
                {c}
              </span>
            ))}
            {more.length > 0 && <MoreChip more={more} />}
          </span>
        )
      )}
    </span>
  )
}
