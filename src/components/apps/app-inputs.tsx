import * as React from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { loadBrands } from "@/lib/brand/brand-storage"
import type { AppInput, InputValue } from "@/lib/apps/types"

/** One field of an app, drawn from its input: the type decides the control */
export function InputField({ input, value, onChange }: { input: AppInput; value: InputValue; onChange: (v: InputValue) => void }) {

  let control: React.ReactNode = null
  switch (input.type) {
    case "text":
      control = <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={input.placeholder} aria-label={input.label} />
      break
    case "longtext":
      control = (
        <Textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={input.placeholder}
          aria-label={input.label}
          rows={3}
          className="min-h-20 resize-y border border-input bg-background/60 focus-visible:border-select/60 focus-visible:bg-background"
        />
      )
      break
    case "select":
      control = (
        <Select value={String(value ?? input.options?.[0] ?? "")} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-xs" aria-label={input.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(input.options ?? []).map((o) => (
              <SelectItem key={o} value={o} className="text-xs">
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
      break
    case "slider":
      control = (
        <div className="flex items-center gap-3">
          <Slider min={input.min ?? 0} max={input.max ?? 100} step={input.step ?? 1} value={[Number(value ?? input.min ?? 0)]} onValueChange={(v) => onChange(v[0])} aria-label={input.label} />
          <span className="w-8 flex-shrink-0 text-right text-xs text-muted-foreground">{String(value ?? input.min ?? 0)}</span>
        </div>
      )
      break
    case "number":
      control = <Input type="number" min={input.min} max={input.max} step={input.step} value={String(value ?? "")} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} aria-label={input.label} />
      break
    case "brand": {
      const kits = loadBrands()
      control = (
        <Select value={typeof value === "string" && value ? value : "none"} onValueChange={(v) => onChange(v === "none" ? undefined : v)}>
          <SelectTrigger className="h-8 text-xs" aria-label={input.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-xs">No brand</SelectItem>
            {kits.map((k) => (
              <SelectItem key={k.id} value={k.id} className="text-xs">
                {k.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
      break
    }
    case "toggle":
      control = <Switch checked={Boolean(value)} onCheckedChange={onChange} aria-label={input.label} />
      break
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-xs font-medium text-foreground">
          {input.label}
          {input.required && <span className="text-muted-foreground"> *</span>}
        </label>
      </div>
      {control}
      {input.hint && <p className="text-xs text-muted-foreground">{input.hint}</p>}
    </div>
  )
}
