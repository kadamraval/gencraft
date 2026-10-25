import * as React from "react"
import { Input } from "@/components/ui/input"
import { convert, currencySymbol, toUsd, useMoney } from "@/lib/currency/currency"

/**
 * An amount typed in the person's own currency (its symbol in front). It is stored in US dollars, which is what providers
 * charge. With `optional`, an empty box means "no limit" and gives undefined.
 */
export function MoneyInput({ usd, onUsd, label, optional = false, placeholder = "No limit" }: { usd: number | undefined; onUsd: (usd: number | undefined) => void; label: string; optional?: boolean; placeholder?: string }) {
  const money = useMoney() // re-renders when the currency or its rate changes
  const shown = usd === undefined ? "" : Math.round(convert(usd).amount * 100) / 100
  const [text, setText] = React.useState<string | null>(null)
  return (
    <div className="relative w-32 flex-shrink-0" data-currency={money.currency}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{currencySymbol()}</span>
      <Input
        type="number"
        min={0}
        step="any"
        value={text ?? shown}
        placeholder={optional ? placeholder : undefined}
        onChange={(e) => {
          setText(e.target.value)
          if (e.target.value === "" && optional) onUsd(undefined)
          else onUsd(Math.max(0, toUsd(Number(e.target.value) || 0)))
        }}
        onBlur={() => setText(null)}
        aria-label={label}
        className="h-8 pl-7 text-right text-xs"
      />
    </div>
  )
}
