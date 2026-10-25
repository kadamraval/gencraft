import { COUNTRIES, setCountry, setCurrency, useMoney } from "@/lib/currency/currency"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const CURRENCIES = [...new Set(["USD", ...COUNTRIES.map((c) => c.currency)])].sort()

/** Country picks a sensible currency; the currency can still be changed on its own. */
export function RegionCurrencyControls() {
  const money = useMoney()
  return (
    <div className="flex items-center gap-2">
      <Select value={money.country} onValueChange={setCountry}>
        <SelectTrigger aria-label="Country" className="h-7 w-44 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {COUNTRIES.map((c) => (
            <SelectItem key={c.code} value={c.code} className="text-xs">
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={money.currency} onValueChange={setCurrency}>
        <SelectTrigger aria-label="Currency" className="h-7 w-24 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {CURRENCIES.map((c) => (
            <SelectItem key={c} value={c} className="text-xs">
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
