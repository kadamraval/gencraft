import { Wallet } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { formatMoney as money } from "@/lib/currency/currency"


/** How much of the agent's budget is spent. AI Elements has no meter for money, so this is the app's own. */
export function BudgetMeter({ spentUsd, budgetUsd }: { spentUsd: number; budgetUsd: number }) {
  const used = budgetUsd > 0 ? Math.min(100, (spentUsd / budgetUsd) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" title={`${money(spentUsd)} of ${money(budgetUsd)} spent`}>
      <Wallet className="size-3.5" />
      <Progress value={used} className="h-1.5 w-20" aria-label="Budget used" />
      <span>{`${money(spentUsd)} of ${money(budgetUsd)}`}</span>
    </div>
  )
}
