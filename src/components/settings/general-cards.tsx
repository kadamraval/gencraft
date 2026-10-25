import * as React from "react"
import { BadgeCheck, BarChart3, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FREE_LIMITS, activateLicense, removeLicense, useLicense } from "@/lib/license"
import { FREE_MISSING, PRICES } from "@/lib/plans"
import { usageLedger } from "@/lib/ledger/usage-store"
import { useMoney } from "@/lib/currency/currency"
import { cn } from "@/lib/utils"

const card = "flex flex-col gap-4 rounded-xl border border-border bg-secondary p-4"

/** Free or Paid. A license key unlocks Paid; it is checked inside the app, with nothing sent anywhere. */
export function LicenseCard() {
  const license = useLicense()
  const [key, setKey] = React.useState("")
  const [checking, setChecking] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const paid = license.plan === "paid"

  const activate = async () => {
    setChecking(true)
    setError(null)
    const ok = await activateLicense(key)
    setChecking(false)
    if (ok) setKey("")
    else setError("This key is not valid. Check that it is copied completely.")
  }

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {paid ? <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" /> : <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
          <span className="text-xs font-semibold text-foreground">License</span>
        </div>
        <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", paid ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-border bg-secondary text-muted-foreground")}>{paid ? "Paid" : "Free"}</span>
      </div>

      {paid ? (
        <>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-foreground">Unlimited projects, Agents, Connectors, building Apps and email support</p>
            <p className="truncate text-xs text-muted-foreground">
              {license.licensee}
              {license.term === "year" && license.expires ? ` · One Year, until ${license.expires}` : license.issued ? ` · Lifetime · ${license.issued}` : ""}
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" className="h-8 self-start text-xs" onClick={removeLicense}>
            Remove license
          </Button>
        </>
      ) : (
        <>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>{FREE_LIMITS.projects} project</li>
            <li>No {FREE_MISSING.join(", no ")}</li>
            <li>Paid: {PRICES.year.line}, or {PRICES.lifetime.line}</li>
          </ul>
          <div className="mt-auto flex items-center gap-2">
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="License key" aria-label="License key" className="h-8 text-xs" />
            <Button type="button" size="sm" className="h-8 min-w-20 text-xs" disabled={!key.trim() || checking} onClick={() => void activate()}>
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Activate"}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </>
      )}
    </div>
  )
}

/** What generation has cost, as estimated from the runs on this device. You pay the providers directly. */
export function CostCard({ onOpenUsage }: { onOpenUsage: () => void }) {
  const money = useMoney()
  const [, tick] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => usageLedger.subscribe(tick), [])
  const today = usageLedger.getSpendOverview("today")
  const month = usageLedger.getSpendOverview("monthly")
  const all = usageLedger.getSpendOverview("all")
  const parts = [
    { label: "Image", cost: month.modalities.image.costUsd, dot: "bg-sky-500" },
    { label: "Video", cost: month.modalities.video.costUsd, dot: "bg-emerald-500" },
    { label: "Audio", cost: month.modalities.audio.costUsd, dot: "bg-pink-500" },
    { label: "Text", cost: month.modalities.text.costUsd, dot: "bg-purple-500" },
  ]
  return (
    <div className={card}>
      <div className="flex items-center gap-2">
        <BarChart3 className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">Estimated cost</span>
      </div>
      <div>
        <p className="text-2xl font-semibold leading-none text-foreground">{money.format(month.totalCostUsd)}</p>
        <p className="mt-1 text-xs text-muted-foreground">This month · {month.totalGenerations} run{month.totalGenerations === 1 ? "" : "s"}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-secondary/50 px-2.5 py-1.5">
          <p className="text-muted-foreground">Today</p>
          <p className="font-medium text-foreground">{money.format(today.totalCostUsd)}</p>
        </div>
        <div className="rounded-lg bg-secondary/50 px-2.5 py-1.5">
          <p className="text-muted-foreground">All time</p>
          <p className="font-medium text-foreground">{money.format(all.totalCostUsd)}</p>
        </div>
      </div>
      <div className="space-y-1">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full", p.dot)} />
              {p.label}
            </span>
            <span className="font-mono text-foreground">{money.format(p.cost)}</span>
          </div>
        ))}
      </div>
      <Button type="button" variant="secondary" size="sm" className="h-8 justify-center gap-1.5 text-xs" onClick={onOpenUsage}>
        <BarChart3 className="h-3 w-3" />
        Usage details
      </Button>
    </div>
  )
}
