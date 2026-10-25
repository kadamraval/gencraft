import * as React from "react"
import { AlignCenter, AlignLeft, AlignRight, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { FontPicker } from "./font-picker"
import type { EditCaption, RichText, TextAnim } from "./edit-model"

/** Everything about a text layer: its words, font, colour, edge, glow, plate, place and how it comes and goes. Each change is a whole new `RichText`. */

const BLACK = "#000000" // allow-color
const ACCENT = "#ff8a00" // allow-color

const WEIGHTS: Array<[number, string]> = [[100, "Thin"], [200, "Extra light"], [300, "Light"], [400, "Regular"], [500, "Medium"], [600, "Semi bold"], [700, "Bold"], [800, "Extra bold"], [900, "Black"]]
const ANIMS: Array<[TextAnim, string]> = [
  ["none", "None"],
  ["fade", "Fade"],
  ["slide-up", "Slide up"],
  ["slide-down", "Slide down"],
  ["slide-left", "Slide left"],
  ["slide-right", "Slide right"],
  ["pop", "Pop"],
  ["bounce", "Bounce"],
  ["zoom", "Zoom"],
  ["blur", "Blur in"],
  ["wipe", "Wipe"],
  ["typewriter", "Typewriter"],
  ["letters", "Letter by letter"],
]

function Group({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(defaultOpen ?? false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border/60 pt-2">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-full justify-between px-1 text-xs font-semibold text-foreground">
          {title}
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-1 pb-2 pt-2">{children}</CollapsibleContent>
    </Collapsible>
  )
}

/** A slider with its box */
function Num({ label, value, min, max, step = 1, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <div className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className="flex items-center gap-1">
          <Input type="number" min={min} max={max} step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && onChange(Math.min(max, Math.max(min, e.target.valueAsNumber)))} aria-label={label} className="h-6 w-16 px-1 text-right text-xs" />
          {unit && <span className="w-3">{unit}</span>}
        </span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0] ?? value)} aria-label={`${label} slider`} />
    </div>
  )
}

function Colour({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      {label}
      <span className="flex items-center gap-1.5">
        <Input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" />
        <span className="w-16 font-mono text-xs">{value}</span>
      </span>
    </label>
  )
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      {label}
      <Switch checked={on} onCheckedChange={onChange} aria-label={label} />
    </div>
  )
}

function AnimRow({ label, value, onChange }: { label: string; value: { kind: TextAnim; duration: number } | undefined; onChange: (v: { kind: TextAnim; duration: number } | undefined) => void }) {
  const kind = value?.kind ?? "none"
  return (
    <div className="space-y-2">
      <div className="space-y-1 text-xs text-muted-foreground">
        {label}
        <Select value={kind} onValueChange={(v) => onChange(v === "none" ? undefined : { kind: v as TextAnim, duration: value?.duration ?? 0.6 })}>
          <SelectTrigger aria-label={label} className="h-8 rounded-md bg-secondary px-2 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANIMS.map(([id, name]) => (
              <SelectItem key={id} value={id} className="text-xs">
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {value && <Num label={`${label} length`} value={value.duration} min={0.1} max={3} step={0.05} unit="s" onChange={(d) => onChange({ kind: value.kind, duration: d })} />}
    </div>
  )
}

export function TextInspector({ cap, onChange }: { cap: EditCaption & { rich: RichText }; onChange: (patch: Partial<EditCaption>) => void }) {
  const r = cap.rich
  const set = (patch: Partial<RichText>) => onChange({ rich: { ...r, ...patch } })
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-foreground">Text</div>
      <Textarea value={cap.text} onChange={(e) => onChange({ text: e.target.value })} rows={3} aria-label="Text" className="resize-none rounded-lg border border-border/60 bg-background text-xs" />

      <Group title="Font" defaultOpen>
        <FontPicker value={r.family} onChange={(family) => set({ family })} />
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1 text-xs text-muted-foreground">
            Weight
            <Select value={String(r.weight)} onValueChange={(v) => set({ weight: Number(v) })}>
              <SelectTrigger aria-label="Weight" className="h-8 rounded-md bg-secondary px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEIGHTS.map(([w, name]) => (
                  <SelectItem key={w} value={String(w)} className="text-xs">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            Capitals
            <Select value={r.case} onValueChange={(v) => set({ case: v as RichText["case"] })}>
              <SelectTrigger aria-label="Capitals" className="h-8 rounded-md bg-secondary px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">As typed</SelectItem>
                <SelectItem value="upper" className="text-xs">ALL CAPS</SelectItem>
                <SelectItem value="lower" className="text-xs">all lower</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Toggle label="Italic" on={r.italic === true} onChange={(v) => set({ italic: v || undefined })} />
        <Num label="Size" value={r.size} min={12} max={320} unit="px" onChange={(size) => set({ size })} />
        <Num label="Letter spacing" value={r.spacing} min={-10} max={60} onChange={(spacing) => set({ spacing })} />
        <Num label="Line height" value={r.lineHeight} min={0.8} max={2.2} step={0.05} onChange={(lineHeight) => set({ lineHeight })} />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          Align
          <span className="flex gap-1">
            {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([id, Icon]) => (
              <Button key={id} type="button" variant="ghost" size="icon" aria-label={`Align ${id}`} aria-pressed={r.align === id} onClick={() => set({ align: id })} className={cn("h-7 w-7", r.align === id ? "bg-secondary text-foreground" : "text-muted-foreground")}>
                <Icon className="h-3.5 w-3.5" />
              </Button>
            ))}
          </span>
        </div>
      </Group>

      <Group title="Colour" defaultOpen>
        <Colour label="Colour" value={r.color} onChange={(color) => set({ color })} />
        <Toggle label="Blend to a second colour" on={Boolean(r.gradient)} onChange={(v) => set({ gradient: v ? { color: ACCENT, angle: 90 } : undefined })} />
        {r.gradient && (
          <>
            <Colour label="Second colour" value={r.gradient.color} onChange={(color) => set({ gradient: { ...r.gradient!, color } })} />
            <Num label="Blend angle" value={r.gradient.angle} min={0} max={360} unit="°" onChange={(angle) => set({ gradient: { ...r.gradient!, angle } })} />
          </>
        )}
        <Num label="Opacity" value={r.opacity} min={0} max={100} unit="%" onChange={(opacity) => set({ opacity })} />
      </Group>

      <Group title="Edge, shadow and glow">
        <Toggle label="Edge" on={Boolean(r.stroke)} onChange={(v) => set({ stroke: v ? { width: 3, color: BLACK } : undefined })} />
        {r.stroke && (
          <>
            <Num label="Edge width" value={r.stroke.width} min={0.5} max={24} step={0.5} onChange={(width) => set({ stroke: { ...r.stroke!, width } })} />
            <Colour label="Edge colour" value={r.stroke.color} onChange={(color) => set({ stroke: { ...r.stroke!, color } })} />
          </>
        )}
        <Toggle label="Shadow" on={Boolean(r.shadow)} onChange={(v) => set({ shadow: v ? { blur: 8, x: 0, y: 4, color: BLACK } : undefined })} />
        {r.shadow && (
          <>
            <Num label="Shadow blur" value={r.shadow.blur} min={0} max={60} onChange={(blur) => set({ shadow: { ...r.shadow!, blur } })} />
            <Num label="Shadow across" value={r.shadow.x} min={-40} max={40} onChange={(x) => set({ shadow: { ...r.shadow!, x } })} />
            <Num label="Shadow down" value={r.shadow.y} min={-40} max={40} onChange={(y) => set({ shadow: { ...r.shadow!, y } })} />
            <Colour label="Shadow colour" value={r.shadow.color} onChange={(color) => set({ shadow: { ...r.shadow!, color } })} />
          </>
        )}
        <Toggle label="Glow" on={Boolean(r.glow)} onChange={(v) => set({ glow: v ? { blur: 24, color: r.color } : undefined })} />
        {r.glow && (
          <>
            <Num label="Glow size" value={r.glow.blur} min={2} max={90} onChange={(blur) => set({ glow: { ...r.glow!, blur } })} />
            <Colour label="Glow colour" value={r.glow.color} onChange={(color) => set({ glow: { ...r.glow!, color } })} />
          </>
        )}
      </Group>

      <Group title="Plate">
        <Toggle label="Plate behind the text" on={Boolean(r.bg)} onChange={(v) => set({ bg: v ? { color: BLACK, opacity: 70, padX: 24, padY: 12, radius: 12 } : undefined })} />
        {r.bg && (
          <>
            <Colour label="Plate colour" value={r.bg.color} onChange={(color) => set({ bg: { ...r.bg!, color } })} />
            <Num label="Plate opacity" value={r.bg.opacity} min={0} max={100} unit="%" onChange={(opacity) => set({ bg: { ...r.bg!, opacity } })} />
            <Num label="Plate across" value={r.bg.padX} min={0} max={120} onChange={(padX) => set({ bg: { ...r.bg!, padX } })} />
            <Num label="Plate down" value={r.bg.padY} min={0} max={80} onChange={(padY) => set({ bg: { ...r.bg!, padY } })} />
            <Num label="Plate corners" value={r.bg.radius} min={0} max={80} onChange={(radius) => set({ bg: { ...r.bg!, radius } })} />
          </>
        )}
      </Group>

      <Group title="Place">
        <Num label="Across" value={r.x} min={-20} max={120} unit="%" onChange={(x) => set({ x })} />
        <Num label="Down" value={r.y} min={-20} max={120} unit="%" onChange={(y) => set({ y })} />
        <Num label="Width before it wraps" value={r.width} min={10} max={100} unit="%" onChange={(width) => set({ width })} />
        <Num label="Turn" value={r.rotation} min={-180} max={180} unit="°" onChange={(rotation) => set({ rotation })} />
        <p className="text-xs text-muted-foreground">You can also drag the text in the picture.</p>
      </Group>

      <Group title="Comes in and goes out">
        <AnimRow label="Comes in" value={r.animIn} onChange={(animIn) => set({ animIn })} />
        <AnimRow label="Goes out" value={r.animOut} onChange={(animOut) => set({ animOut })} />
      </Group>
    </div>
  )
}
