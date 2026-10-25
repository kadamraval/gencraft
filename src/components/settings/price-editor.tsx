import * as React from "react"
import { Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getPriceState } from "@/lib/registry/store"
import { UNIT_TEXT } from "@/lib/registry/types"
import type { ModelRecord, PriceOverride, PriceUnit } from "@/lib/registry/types"

const UNITS: PriceUnit[] = ["per_image", "per_second", "per_run", "per_1m_tokens", "per_megapixel", "per_1k_chars", "per_minute"]

const SOURCE_TEXT: Record<ModelRecord["price"]["source"], string> = {
  api: "the provider's own price list",
  scraped: "the provider's model page",
  curated: "a reviewed price",
  estimate: "an estimate",
  edited: "your edit",
}

/**
 * Lets the user correct a price. The correction is kept exactly as written through every refresh. If the
 * provider's own number later moves, the user is told and chooses; nothing changes silently.
 * Prices are entered in US dollars, which is how providers bill.
 */
export function PriceEditor({ model, onChange }: { model: ModelRecord; onChange: (id: string, next: PriceOverride | null) => void }) {
  const { raw, override, providerMoved } = getPriceState(model.id)
  const base = raw?.price
  const [open, setOpen] = React.useState(false)
  const [unit, setUnit] = React.useState<PriceUnit>(override?.unit ?? (base && base.unit !== "unknown" ? base.unit : "per_run"))
  const [amount, setAmount] = React.useState(String(override?.amount ?? base?.amount ?? ""))
  const [out, setOut] = React.useState(String(override?.outputAmount ?? base?.outputAmount ?? ""))

  React.useEffect(() => {
    if (!open) return
    setUnit(override?.unit ?? (base && base.unit !== "unknown" ? base.unit : "per_run"))
    setAmount(String(override?.amount ?? base?.amount ?? ""))
    setOut(String(override?.outputAmount ?? base?.outputAmount ?? ""))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = Number(amount)
  const parsedOut = out.trim() === "" ? undefined : Number(out)
  const valid = amount.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 && (parsedOut === undefined || (Number.isFinite(parsedOut) && parsedOut >= 0))
  const tokens = unit === "per_1m_tokens"

  const save = () => {
    onChange(model.id, { unit, amount: parsed, outputAmount: tokens ? parsedOut : undefined, editedAt: new Date().toISOString(), providerAmount: base?.amount ?? null })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="iconSm" aria-label={`Edit price of ${model.name}`} className={`h-6 w-6 p-0 ${providerMoved ? "text-amber-500" : "text-muted-foreground"}`}>
              <Pencil className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{providerMoved ? "The provider's price changed since you edited" : override ? "Price edited by you" : "Correct this price"}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 space-y-2.5 p-3">
        <div className="text-xs font-semibold text-foreground">{model.name}</div>
        <div className="text-xs text-muted-foreground">
          {base && base.amount !== null
            ? `Provider price: $${base.amount}${base.outputAmount !== undefined ? ` in / $${base.outputAmount} out` : ""} ${UNIT_TEXT[base.unit]}, from ${SOURCE_TEXT[base.source]}.`
            : "No price was found for this model. Enter the one on the provider's page."}
        </div>

        {providerMoved && override && base && (
          <div className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
            <div>
              The provider now lists ${base.amount}. You edited it when it was {override.providerAmount === null ? "missing" : `$${override.providerAmount}`}.
            </div>
            <div className="flex gap-1.5">
              <Button type="button" size="sm" variant="secondary" className="h-6 px-2 text-xs" onClick={() => onChange(model.id, { ...override, providerAmount: base.amount })}>
                Keep mine
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onChange(model.id, null)}>
                Use provider's
              </Button>
            </div>
          </div>
        )}

        <Select value={unit} onValueChange={(v) => setUnit(v as PriceUnit)}>
          <SelectTrigger aria-label="Billed" className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UNITS.map((u) => (
              <SelectItem key={u} value={u} className="text-xs">
                {UNIT_TEXT[u]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={tokens ? "Input, USD" : "USD"} aria-label="Price in US dollars" className="h-8 text-xs" />
          {tokens && <Input value={out} onChange={(e) => setOut(e.target.value)} inputMode="decimal" placeholder="Output, USD" aria-label="Output price in US dollars" className="h-8 text-xs" />}
        </div>
        <p className="text-xs text-muted-foreground">Entered in US dollars, the way providers bill. Your correction is kept through every refresh.</p>
        <div className="flex justify-end gap-1.5">
          {override && (
            <Button type="button" size="sm" variant="ghost" onClick={() => { onChange(model.id, null); setOpen(false) }}>
              Reset
            </Button>
          )}
          <Button type="button" size="sm" disabled={!valid} onClick={save}>
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
