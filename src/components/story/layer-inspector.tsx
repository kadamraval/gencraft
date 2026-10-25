import * as React from "react"
import { ChevronDown, Diamond, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { FX_DEFAULT } from "./clip-fx"
import { KEY_PARAMS, resolveKeys, type ClipFx, type KeyFrame, type KeyParam } from "./edit-model"

interface Props {
  fx: ClipFx | undefined
  /** A change to one or more fields; undefined puts a field back to its default */
  onChange: (patch: Partial<ClipFx>) => void
  onReset: () => void
  /** A still picture has no speed and no sound */
  still: boolean
  /** Seconds from the start of the clip to the playhead, or null when the playhead is outside it. Keyframes go here. */
  into: number | null
  /** Copy this clip's look, and paste a copied look onto it */
  onCopy: () => void
  onPaste: () => void
  canPaste: boolean
}

interface RowDef {
  key: keyof ClipFx
  label: string
  min: number
  max: number
  step: number
  unit?: string
  def: number
}

const num = (fx: ClipFx | undefined, row: RowDef) => (fx?.[row.key] as number | undefined) ?? row.def
const isKeyParam = (key: keyof ClipFx): key is KeyParam => (KEY_PARAMS as string[]).includes(key)
const NEAR = 0.05

/** One number: a slider and a box, both writing the same field. Some rows can be animated with keyframes at the playhead. */
function FxRow({ row, fx, onChange, into }: { row: RowDef; fx: ClipFx | undefined; onChange: Props["onChange"]; into?: number | null }) {
  const keyed = isKeyParam(row.key) ? fx?.keys?.[row.key] : undefined
  const animated = keyed !== undefined && keyed.length > 0
  const shown = animated && into !== null && into !== undefined ? resolveKeys(fx, into) : fx
  const value = num(shown, row)
  const atKey = animated && into !== null && into !== undefined ? keyed.find((k) => Math.abs(k.t - into) <= NEAR) : undefined
  const writeKeys = (frames: KeyFrame[]) => {
    if (!isKeyParam(row.key)) return
    const keys = { ...(fx?.keys ?? {}), [row.key]: frames.length ? frames : undefined }
    onChange({ keys: Object.values(keys).some(Boolean) ? keys : undefined })
  }
  const set = (v: number) => {
    if (!Number.isFinite(v)) return
    const clamped = Math.min(row.max, Math.max(row.min, v))
    if (animated && into !== null && into !== undefined) {
      writeKeys([...(keyed ?? []).filter((k) => Math.abs(k.t - into) > NEAR), { t: into, v: clamped }])
      return
    }
    onChange({ [row.key]: clamped === row.def ? undefined : clamped })
  }
  const toggleKey = () => {
    if (into === null || into === undefined) return
    if (atKey) writeKeys((keyed ?? []).filter((k) => k !== atKey))
    else writeKeys([...(keyed ?? []), { t: into, v: value }])
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          {isKeyParam(row.key) && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={into === null || into === undefined}
              aria-label={atKey ? `Remove the ${row.label} keyframe here` : `Add a ${row.label} keyframe at the playhead`}
              aria-pressed={animated}
              onClick={toggleKey}
              className={cn("h-5 w-5", atKey ? "text-primary" : animated ? "text-foreground" : "text-muted-foreground")}
            >
              <Diamond className={cn("h-3 w-3", atKey && "fill-current")} />
            </Button>
          )}
          {row.label}
        </span>
        <div className="flex items-center gap-1">
          <Input type="number" aria-label={row.label} min={row.min} max={row.max} step={row.step} value={value} onChange={(e) => set(Number(e.target.value))} className="h-7 w-16 px-1.5 text-right font-mono text-xs" />
          {row.unit && <span className="w-4 text-xs">{row.unit}</span>}
        </div>
      </div>
      <Slider value={[value]} min={row.min} max={row.max} step={row.step} onValueChange={(v) => set(v[0] ?? row.def)} aria-label={`${row.label} slider`} />
    </div>
  )
}

function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(defaultOpen)
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

const BLENDS: Array<{ id: NonNullable<ClipFx["blend"]>; label: string }> = [
  { id: "normal", label: "Normal" },
  { id: "multiply", label: "Multiply" },
  { id: "screen", label: "Screen" },
  { id: "overlay", label: "Overlay" },
  { id: "darken", label: "Darken" },
  { id: "lighten", label: "Lighten" },
]

const R = {
  opacity: { key: "opacity", label: "Opacity", min: 0, max: 100, step: 1, unit: "%", def: FX_DEFAULT.opacity },
  scale: { key: "scale", label: "Scale", min: 10, max: 400, step: 1, unit: "%", def: FX_DEFAULT.scale },
  x: { key: "x", label: "Position X", min: -100, max: 100, step: 1, unit: "%", def: FX_DEFAULT.x },
  y: { key: "y", label: "Position Y", min: -100, max: 100, step: 1, unit: "%", def: FX_DEFAULT.y },
  rotation: { key: "rotation", label: "Rotation", min: -180, max: 180, step: 1, unit: "°", def: FX_DEFAULT.rotation },
  cropL: { key: "cropL", label: "Crop left", min: 0, max: 90, step: 1, unit: "%", def: 0 },
  cropT: { key: "cropT", label: "Crop top", min: 0, max: 90, step: 1, unit: "%", def: 0 },
  cropR: { key: "cropR", label: "Crop right", min: 0, max: 90, step: 1, unit: "%", def: 0 },
  cropB: { key: "cropB", label: "Crop bottom", min: 0, max: 90, step: 1, unit: "%", def: 0 },
  speed: { key: "speed", label: "Speed", min: 25, max: 400, step: 5, unit: "%", def: FX_DEFAULT.speed },
  fadeIn: { key: "fadeIn", label: "Fade in", min: 0, max: 5, step: 0.1, unit: "s", def: 0 },
  fadeOut: { key: "fadeOut", label: "Fade out", min: 0, max: 5, step: 0.1, unit: "s", def: 0 },
  volume: { key: "volume", label: "Volume", min: 0, max: 100, step: 1, unit: "%", def: 100 },
  brightness: { key: "brightness", label: "Brightness", min: 0, max: 200, step: 1, unit: "%", def: FX_DEFAULT.brightness },
  contrast: { key: "contrast", label: "Contrast", min: 0, max: 200, step: 1, unit: "%", def: FX_DEFAULT.contrast },
  saturation: { key: "saturation", label: "Saturation", min: 0, max: 200, step: 1, unit: "%", def: FX_DEFAULT.saturation },
  blur: { key: "blur", label: "Blur", min: 0, max: 40, step: 1, unit: "px", def: FX_DEFAULT.blur },
  temperature: { key: "temperature", label: "Temperature", min: -100, max: 100, step: 1, def: 0 },
  tint: { key: "tint", label: "Tint", min: -100, max: 100, step: 1, def: 0 },
  highlights: { key: "highlights", label: "Highlights", min: -100, max: 100, step: 1, def: 0 },
  shadows: { key: "shadows", label: "Shadows", min: -100, max: 100, step: 1, def: 0 },
  vibrance: { key: "vibrance", label: "Vibrance", min: -100, max: 100, step: 1, def: 0 },
  fade: { key: "fade", label: "Faded blacks", min: 0, max: 100, step: 1, unit: "%", def: 0 },
  shadowHue: { key: "shadowHue", label: "Shadow colour", min: 0, max: 360, step: 1, unit: "°", def: 0 },
  shadowTone: { key: "shadowTone", label: "Shadow amount", min: 0, max: 100, step: 1, unit: "%", def: 0 },
  highlightHue: { key: "highlightHue", label: "Highlight colour", min: 0, max: 360, step: 1, unit: "°", def: 0 },
  highlightTone: { key: "highlightTone", label: "Highlight amount", min: 0, max: 100, step: 1, unit: "%", def: 0 },
  grain: { key: "grain", label: "Film grain", min: 0, max: 100, step: 1, unit: "%", def: 0 },
  vignette: { key: "vignette", label: "Vignette", min: 0, max: 100, step: 1, unit: "%", def: 0 },
  bloom: { key: "bloom", label: "Bloom", min: 0, max: 100, step: 1, unit: "%", def: 0 },
  halation: { key: "halation", label: "Halation", min: 0, max: 100, step: 1, unit: "%", def: 0 },
  chroma: { key: "chroma", label: "Colour fringes", min: 0, max: 100, step: 1, unit: "%", def: 0 },
  sharpen: { key: "sharpen", label: "Sharpen", min: 0, max: 100, step: 1, unit: "%", def: 0 },
  glitch: { key: "glitch", label: "Glitch", min: 0, max: 100, step: 1, unit: "%", def: 0 },
  scanlines: { key: "scanlines", label: "Scan lines", min: 0, max: 100, step: 1, unit: "%", def: 0 },
  leak: { key: "leak", label: "Light leak", min: 0, max: 100, step: 1, unit: "%", def: 0 },
  leakHue: { key: "leakHue", label: "Leak colour", min: 0, max: 360, step: 1, unit: "°", def: 25 },
} satisfies Record<string, RowDef>

/**
 * Everything you can do to a layer once it is selected, in the order Premiere's Effect Controls lists it:
 * motion, opacity, time, fades, sound and colour. Each field is written into the clip and read by the preview
 * and the export alike.
 */
export function LayerInspector({ fx, onChange, onReset, still, into, onCopy, onPaste, canPaste }: Props) {
  const row = (r: RowDef) => <FxRow key={r.key} row={r} fx={fx} onChange={onChange} into={into} />
  const edited = fx !== undefined
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">Effect controls</span>
        <div className="flex items-center">
          <Button type="button" variant="ghost" size="sm" onClick={onCopy} aria-label="Copy this look" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground">
            Copy
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={!canPaste} onClick={onPaste} aria-label="Paste the copied look" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground">
            Paste
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={!edited} onClick={onReset} className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        </div>
      </div>

      <Section title="Motion" defaultOpen>
        {row(R.scale)}
        {row(R.x)}
        {row(R.y)}
        {row(R.rotation)}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          Flip across
          <Switch aria-label="Flip across" checked={fx?.flipH === true} onCheckedChange={(v) => onChange({ flipH: v || undefined })} />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          Flip upside down
          <Switch aria-label="Flip upside down" checked={fx?.flipV === true} onCheckedChange={(v) => onChange({ flipV: v || undefined })} />
        </div>
      </Section>

      <Section title="Opacity" defaultOpen>
        {row(R.opacity)}
        <div className="space-y-1 text-xs text-muted-foreground">
          Blend
          <Select value={fx?.blend ?? "normal"} onValueChange={(v) => onChange({ blend: v === "normal" ? undefined : (v as ClipFx["blend"]) })}>
            <SelectTrigger aria-label="Blend" className="h-8 rounded-md bg-secondary px-2 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLENDS.map((b) => (
                <SelectItem key={b.id} value={b.id} className="text-xs">
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Section title="Crop">
        {row(R.cropL)}
        {row(R.cropT)}
        {row(R.cropR)}
        {row(R.cropB)}
      </Section>

      {!still && (
        <Section title="Time">
          {row(R.speed)}
          <p className="text-xs text-muted-foreground">Speed changes how much of the footage plays in the clip's length. Change the length to use more or less of it.</p>
        </Section>
      )}

      <Section title="Fades">
        {row(R.fadeIn)}
        {row(R.fadeOut)}
      </Section>

      {!still && (
        <Section title="Sound">
          <FxRow
            row={R.volume}
            fx={fx && { ...fx, volume: fx.volume === undefined ? undefined : fx.volume * 100 }}
            onChange={(patch) => onChange("volume" in patch ? { volume: patch.volume === undefined ? undefined : patch.volume / 100 } : patch)}
          />
        </Section>
      )}

      <Section title="Colour">
        {row(R.brightness)}
        {row(R.contrast)}
        {row(R.saturation)}
        {row(R.blur)}
      </Section>

      <Section title="Grade">
        {row(R.temperature)}
        {row(R.tint)}
        {row(R.highlights)}
        {row(R.shadows)}
        {row(R.vibrance)}
        {row(R.fade)}
        {row(R.shadowHue)}
        {row(R.shadowTone)}
        {row(R.highlightHue)}
        {row(R.highlightTone)}
      </Section>

      <Section title="Film and lens">
        {row(R.grain)}
        {row(R.vignette)}
        {row(R.bloom)}
        {row(R.halation)}
        {row(R.chroma)}
        {row(R.sharpen)}
        {row(R.glitch)}
        {row(R.scanlines)}
        {row(R.leak)}
        {row(R.leakHue)}
        <p className="text-xs text-muted-foreground">These are drawn on the graphics card. Where a window has none they are left out.</p>
      </Section>
    </div>
  )
}
