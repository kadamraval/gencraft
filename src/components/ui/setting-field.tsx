import * as React from "react"
import { Info } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { titleCase } from "@/lib/registry/setting-words"

/**
 * The one way a setting is shown in a panel: its name in plain words, a small info icon that explains it, and the control. Every setting
 * (a choice, a slider, a switch) uses the same pieces, so the labels, spacing and fields look the same everywhere.
 */

/** The name of a setting with its info icon; `trailing` sits on the right (the value of a slider, a switch) */
export function SettingLabel({ label, info, trailing, className }: { label: string; info?: string; trailing?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-5 items-center justify-between gap-2", className)}>
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
        <span className="truncate">{titleCase(label)}</span>
        {info && (
          <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={`About ${label}`} onPointerDown={(e) => e.stopPropagation()} className="pointer-events-auto flex-shrink-0 rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-56 whitespace-normal py-1.5 leading-snug">
              {info}
            </TooltipContent>
          </Tooltip>
          </TooltipProvider>
        )}
      </span>
      {trailing}
    </div>
  )
}

export interface SettingOption {
  value: string
  label?: string
  /** A line under the name that says what the choice is for */
  info?: string
  disabled?: boolean
  /** Shown when the pointer rests on a choice (the size a scale gives) */
  hint?: string
}

/** A setting with a list of choices */
export function SettingSelect({ label, info, value, options, onChange, className }: { label: string; info?: string; value: string; options: Array<string | SettingOption>; onChange: (v: string) => void; className?: string }) {
  const list = options.map((o) => (typeof o === "string" ? { value: o } : o))
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <SettingLabel label={label} info={info} />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="bg-secondary/60 hover:bg-secondary">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {list.map((o) => (
            <SelectItem key={o.value} value={o.value} description={o.info} disabled={o.disabled}>
              {o.label ?? o.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** A setting with a few short choices shown side by side, one chosen (a scale: x1 x2 x4); a choice that cannot be used is dimmed */
export function SettingSegments({ label, info, value, options, onChange, className }: { label: string; info?: string; value: string; options: SettingOption[]; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <SettingLabel label={label} info={info} />
      <TooltipProvider delayDuration={150}>
      <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-md border border-input bg-secondary/60 p-1">
        {options.map((o) => {
          const on = value === o.value
          const button = (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={o.disabled}
              onClick={() => onChange(o.value)}
              className={cn("h-7 flex-1 rounded text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40", on ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground")}
            >
              {o.label ?? o.value}
            </button>
          )
          return o.hint ? (
            <Tooltip key={o.value}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent side="top">{o.hint}</TooltipContent>
            </Tooltip>
          ) : (
            button
          )
        })}
      </div>
      </TooltipProvider>
    </div>
  )
}

/**
 * A setting with a range, as one field: the name, its info icon and the value sit on the box, which fills with the select colour as far as
 * the value, with a thin marker at the spot. Drag anywhere on the box; double-click to go back to the start value. The fill is the slider's
 * own range part, so nothing is styled by hand.
 */
export function SettingSlider({ label, info, value, min, max, step = 1, unit = "", start, onChange, className }: { label: string; info?: string; value: number; min: number; max: number; step?: number; unit?: string; start?: number; onChange: (v: number) => void; className?: string }) {
  const home = start ?? (min < 0 && max > 0 ? 0 : min)
  return (
    <SliderPrimitive.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onChange(v[0]!)}
      onDoubleClick={() => onChange(home)}
      aria-label={label}
      className={cn("group relative flex h-9 w-full cursor-ew-resize touch-none select-none items-center overflow-hidden rounded-md border border-input bg-secondary/60 transition-colors hover:bg-secondary focus-within:ring-1 focus-within:ring-ring", className)}
    >
      <SliderPrimitive.Track className="absolute inset-0 h-full w-full">
        <SliderPrimitive.Range className="absolute h-full bg-muted-foreground/20 transition-colors group-hover:bg-muted-foreground/30" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-full w-0.5 bg-muted-foreground outline-none" />
      <div className="pointer-events-none relative w-full px-3">
        <SettingLabel label={label} info={info} trailing={<span className="tabular-nums text-xs text-muted-foreground">{`${value}${unit}`}</span>} />
      </div>
    </SliderPrimitive.Root>
  )
}

/** A setting that is on or off */
export function SettingSwitch({ label, info, checked, onChange, className }: { label: string; info?: string; checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  return <SettingLabel label={label} info={info} className={cn("h-8", className)} trailing={<Switch checked={checked} onCheckedChange={onChange} aria-label={label} />} />
}
