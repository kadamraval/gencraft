import * as React from "react"
import { Blocks, Bot, CalendarDays, Check, Clapperboard, Crown, FolderKanban, Gift, KeyRound, Layers, LifeBuoy, Minus, Palette, Plug, Shapes, ShieldCheck, Sparkles, WandSparkles, HardDrive, GitBranch, Wallet } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FREE_POINTS, PAID_EXTRAS, PLAN_ROWS, PRICES } from "@/lib/plans"
import { cn } from "@/lib/utils"

/**
 * The pricing page of the first-run setup. Three cards side by side, Lifetime raised in the middle; below them every feature compared, one
 * group at a time. The words come from `src/lib/plans.ts`, the same place the limits are read from.
 */

export type PlanChoice = "free" | "lifetime" | "year"

const GROUP_ICONS: Record<string, LucideIcon> = {
  Projects: FolderKanban,
  "Create & Edit": WandSparkles,
  Story: Clapperboard,
  Agents: Bot,
  Brand: Palette,
  Elements: Shapes,
  Library: Layers,
  Apps: Blocks,
  Connectors: Plug,
  BYOK: KeyRound,
  Support: LifeBuoy,
}

interface Group {
  main: string
  rows: Array<{ sub: string; free: string; paid: string }>
}

/** The table rows grouped under their main name (a row without a main belongs to the one above it) */
function groups(): Group[] {
  const out: Group[] = []
  for (const row of PLAN_ROWS) {
    if (row.main || out.length === 0) out.push({ main: row.main, rows: [] })
    out[out.length - 1]!.rows.push({ sub: row.sub, free: row.free, paid: row.paid })
  }
  return out
}

function Cell({ value, paid }: { value: string; paid?: boolean }) {
  if (value === "Yes") return <Check className={cn("h-4 w-4", paid ? "text-primary" : "text-foreground")} aria-label="Included" />
  if (value === "No") return <Minus className="h-4 w-4 text-muted-foreground/60" aria-label="Not included" />
  return <span className={cn("text-xs", paid ? "font-medium text-foreground" : "text-foreground")}>{value}</span>
}

interface CardProps {
  icon: LucideIcon
  name: string
  price: string
  per: string
  tagline: string
  lead?: string
  points: string[]
  cta: string
  featured?: boolean
  selected: boolean
  onPick: () => void
  className?: string
}

function PlanCard({ icon: Icon, name, price, per, tagline, lead, points, cta, featured, selected, onPick, className }: CardProps) {
  return (
    <div className={cn("relative flex flex-col", featured && "md:z-10", className)}>
      {featured && <div aria-hidden="true" className="absolute -inset-3 -z-10 rounded-[2rem] bg-primary/15 blur-2xl" />}
      <div
        className={cn(
          "flex h-full flex-col gap-4 rounded-3xl border bg-card p-6 transition-colors",
          featured ? "border-2 border-primary shadow-2xl md:py-9" : "border-border",
          selected && !featured && "border-primary",
        )}
      >
        {featured && (
          <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
            <Sparkles className="h-3 w-3" />
            Best value
          </span>
        )}
        <div className="flex items-center gap-3">
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", featured ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground")}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{tagline}</p>
          </div>
        </div>
        <p className="flex items-baseline gap-1.5">
          <span className={cn("font-semibold tracking-tight text-foreground", featured ? "text-4xl" : "text-3xl")}>{price}</span>
          <span className="text-xs text-muted-foreground">{per}</span>
        </p>
        <ul className="flex-1 space-y-2 text-xs">
          {lead && <li className="font-medium text-muted-foreground">{lead}</li>}
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2 text-foreground">
              <Check className={cn("mt-0.5 h-3.5 w-3.5 flex-shrink-0", featured ? "text-primary" : "text-muted-foreground")} />
              {p}
            </li>
          ))}
        </ul>
        <Button type="button" size="lg" variant={featured ? "default" : "outline"} aria-pressed={selected} onClick={onPick} className="w-full gap-1.5">
          {selected && <Check className="h-4 w-4" />}
          {cta}
        </Button>
      </div>
    </div>
  )
}

const FACTS: Array<{ icon: LucideIcon; text: string }> = [
  { icon: GitBranch, text: "Open source, AGPL-3.0" },
  { icon: HardDrive, text: "Your files stay on your device" },
  { icon: Wallet, text: "You pay the model providers directly" },
  { icon: ShieldCheck, text: "Your keys never leave this device" },
]

interface Props {
  choice: PlanChoice
  onChoose: (choice: PlanChoice) => void
  /** False in a community build: only Free exists */
  paidAvailable: boolean
  /** Shown under the cards, for example the licence key box */
  children?: React.ReactNode
}

export function PricingPage({ choice, onChoose, paidAvailable, children }: Props) {
  const table = React.useMemo(groups, [])
  return (
    <div className="space-y-10">
      <div className="grid items-center gap-5 md:grid-cols-3">
        <PlanCard
          icon={Gift}
          name="Free"
          tagline="Open source"
          price="$0"
          per="forever"
          points={FREE_POINTS}
          cta={choice === "free" ? "Free selected" : "Start free"}
          selected={choice === "free"}
          onPick={() => onChoose("free")}
          className="order-2 md:order-none"
        />
        {paidAvailable ? (
          <PlanCard
            icon={Crown}
            name={`Paid · ${PRICES.lifetime.label}`}
            tagline="Pay once, keep it"
            price={`$${PRICES.lifetime.usd}`}
            per="once, for life"
            lead="Everything in Free, plus"
            points={PAID_EXTRAS}
            cta={choice === "lifetime" ? "Lifetime selected" : "Get Lifetime"}
            featured
            selected={choice === "lifetime"}
            onPick={() => onChoose("lifetime")}
            className="order-first md:order-none"
          />
        ) : (
          <p className="rounded-3xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">This community build runs on the Free plan. Paid is in the official app.</p>
        )}
        {paidAvailable && (
          <PlanCard
            icon={CalendarDays}
            name={`Paid · ${PRICES.year.label}`}
            tagline="Same features"
            price={`$${PRICES.year.usd}`}
            per="per year"
            lead="Everything in Free, plus"
            points={PAID_EXTRAS}
            cta={choice === "year" ? "One Year selected" : "Get One Year"}
            selected={choice === "year"}
            onPick={() => onChoose("year")}
            className="order-3 md:order-none"
          />
        )}
      </div>

      {children}

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {FACTS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
            <Icon className="h-4 w-4 flex-shrink-0 text-foreground" />
            {text}
          </li>
        ))}
      </ul>

      <section aria-labelledby="compare-title" className="space-y-3">
        <h2 id="compare-title" className="text-center text-sm font-semibold text-foreground">
          Compare every feature
        </h2>
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
          <div className="grid grid-cols-[1.6fr_1fr_1fr] items-center gap-2 border-b border-border bg-secondary/60 px-4 py-3 text-xs font-semibold">
            <span className="text-muted-foreground">Feature</span>
            <span className="text-foreground">Free</span>
            <span className="flex items-center gap-1.5 text-primary">
              <Crown className="h-3.5 w-3.5" />
              Paid
            </span>
          </div>
          {table.map((g, gi) => {
            const Icon = GROUP_ICONS[g.main] ?? Sparkles
            return (
              <div key={`${g.main}-${gi}`} className="border-b border-border/60 last:border-b-0">
                <div className="flex items-center gap-2 bg-secondary/30 px-4 py-2 text-xs font-semibold text-foreground">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {g.main}
                </div>
                {g.rows.map((r, i) => (
                  <div key={`${r.sub}-${i}`} className="grid grid-cols-[1.6fr_1fr_1fr] items-center gap-2 px-4 py-2">
                    <span className="min-w-0 pl-5 text-xs leading-snug text-muted-foreground">{r.sub || g.main}</span>
                    <span>
                      <Cell value={r.free} />
                    </span>
                    <span>
                      <Cell value={r.paid} paid />
                    </span>
                  </div>
                ))}
              </div>
            )
          })}
          {/* One tint down the whole Paid column (the columns are 1.6 : 1 : 1, so Paid is the last 1/3.6) */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-[27.78%] bg-primary/5" />
        </div>
      </section>
    </div>
  )
}
