import type { ParamProperty, ParamSchema } from "@/lib/registry/types"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { plainName, plainValue } from "@/lib/registry/plain-names"

export { defaultsFor, clampToSchema, type ParamValues } from "@/lib/registry/param-logic"
import type { ParamValues } from "@/lib/registry/param-logic"

/** Keys the composer surfaces as compact inline controls; everything else lives under "More". */
export const PINNED_PARAMS = ["aspect_ratio", "image_size", "size", "resolution", "quality", "duration", "num_images", "n", "camera_motion"] as const

export function isEditable(p: ParamProperty): boolean {
  return !p.format && !p.rejected && (Boolean(p.enum?.length) || p.type === "boolean" || p.type === "number" || p.type === "integer" || p.type === "string")
}

/** Order under More: what makes the model different first, then seed and prompt helpers, then the provider's low-level settings. */
const TIER_ORDER: Record<NonNullable<ParamProperty["tier"]> | "none", number> = { common: 0, unique: 1, none: 2, advanced: 3, technical: 4 }
export const byTier = (props: Record<string, ParamProperty>) => (a: string, b: string) => TIER_ORDER[props[a]?.tier ?? "none"] - TIER_ORDER[props[b]?.tier ?? "none"]

export const UNTESTED_NOTE = "Documented by the maker; this provider does not list it yet, so it is untested here."

/** The words a person reads for a setting. A provider that titles a field with its own machine name ("output_format") gets plain words instead. */
export function labelOf(key: string, p: Pick<ParamProperty, "title">): string {
  // A creator's own words first; then the provider's title; then the field name read as words
  return plainName(key) ?? (p.title && p.title !== key ? p.title : key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()))
}

function optionLabel(key: string, o: string | number): string {
  if (key === "duration" && typeof o === "number" && o <= 0) return "Auto"
  return plainValue(key, o) ?? `${o}${unitSuffix(key)}`
}

function unitSuffix(key: string): string {
  if (key === "duration") return "s"
  return ""
}

interface FieldProps {
  name: string
  prop: ParamProperty
  value: unknown
  onChange: (value: unknown) => void
  compact?: boolean
  /** The maker's rule fixes this setting; the reason is shown and the control is off */
  locked?: string
  /** The maker's rule leaves only these values */
  allowed?: unknown[]
}

const sameValue = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase()

export function ParamField({ name, prop, value, onChange, compact, locked, allowed }: FieldProps) {
  const label = labelOf(name, prop)

  if (prop.enum?.length) {
    const options = allowed ? prop.enum.filter((o) => allowed.some((a) => sameValue(a, o))) : prop.enum
    const current = options.find((o) => o === value) ?? options[0]
    return (
      <Select
        value={String(current)}
        disabled={Boolean(locked)}
        onValueChange={(v) => onChange(options.find((o) => String(o) === v) ?? v)}
      >
        <SelectTrigger
          aria-label={label}
          title={locked ? `${label}: ${locked}` : label}
          className={cn("gap-1.5 text-xs", compact ? "h-7 w-auto min-w-16 px-2.5" : "h-8 w-full")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={String(o)} value={String(o)} className="text-xs">
              {optionLabel(name, o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (prop.type === "boolean") {
    return <Switch checked={Boolean(value)} onCheckedChange={onChange} aria-label={label} disabled={Boolean(locked)} title={locked} />
  }

  if ((prop.type === "number" || prop.type === "integer") && prop.minimum !== undefined && prop.maximum !== undefined) {
    const step = prop.type === "integer" ? 1 : (prop.maximum - prop.minimum) / 100
    const num = typeof value === "number" ? value : (prop.minimum + prop.maximum) / 2
    return (
      <div className="flex items-center gap-3">
        <Slider
          min={prop.minimum}
          max={prop.maximum}
          step={step}
          value={[num]}
          onValueChange={(v) => onChange(v[0])}
          aria-label={label}
        />
        <span className="w-12 text-right font-mono text-xs text-muted-foreground">{Number(num.toFixed(2))}</span>
      </div>
    )
  }

  if (prop.type === "number" || prop.type === "integer") {
    return (
      <Input
        type="number"
        aria-label={label}
        value={typeof value === "number" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className="h-8 text-xs"
      />
    )
  }

  return (
    <Input
      aria-label={label}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 text-xs"
    />
  )
}

interface SchemaFormProps {
  schema: ParamSchema
  values: ParamValues
  onChange: (key: string, value: unknown) => void
  /** Only render these keys, in this order. */
  only?: readonly string[]
  /** Skip these keys. */
  exclude?: readonly string[]
  /** Inline = bare controls for a toolbar. Stack = labelled rows for a panel. Rows = a settings panel: the name on the left, the control on the right, in groups. */
  layout?: "inline" | "stack" | "rows"
  /** Group the rows under short headings: what this model does, more options, technical */
  headings?: boolean
  /** Settings the maker fixes, with the reason */
  locked?: Record<string, string>
  /** Settings the maker narrows to a few values, with the reason */
  narrowed?: Record<string, { allowed: unknown[]; reason: string }>
}

/** The heading a setting sits under in the More menu */
const HEADING: Record<NonNullable<ParamProperty["tier"]> | "none", string> = { common: "This model", unique: "This model", none: "More options", advanced: "More options", technical: "Technical" }

export function SchemaForm({ schema, values, onChange, only, exclude, layout = "stack", headings, locked, narrowed }: SchemaFormProps) {
  const keys = (only ?? Object.keys(schema.properties)).filter((k) => {
    const p = schema.properties[k]
    return p && isEditable(p) && !exclude?.includes(k)
  })
  if (keys.length === 0) return null

  if (layout === "inline") {
    return (
      <>
        {keys.map((k) => (
          <ParamField key={k} name={k} prop={schema.properties[k]!} value={values[k]} onChange={(v) => onChange(k, v)} compact locked={locked?.[k]} allowed={narrowed?.[k]?.allowed} />
        ))}
      </>
    )
  }

  if (layout === "rows") {
    return (
      <div className="flex flex-col divide-y divide-border/40" data-testid="settings-rows">
        {keys.map((k) => {
          const p = schema.properties[k]!
          const stacked = (p.type === "number" || p.type === "integer") && !p.enum?.length && p.minimum !== undefined && p.maximum !== undefined
          return (
            <div key={k} className={cn("flex gap-3 py-2", stacked ? "flex-col" : "items-center justify-between")}>
              <label className="min-w-0 truncate text-xs text-foreground">{labelOf(k, p)}</label>
              <div className={stacked ? "w-full" : "w-40 flex-shrink-0"}>
                <ParamField name={k} prop={p} value={values[k]} onChange={(v) => onChange(k, v)} locked={locked?.[k]} allowed={narrowed?.[k]?.allowed} />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {keys.map((k, i) => {
        const p = schema.properties[k]!
        const heading = HEADING[p.tier ?? "none"]
        const first = i === 0 || HEADING[schema.properties[keys[i - 1]!]!.tier ?? "none"] !== heading
        return (
          <div key={k} className="flex flex-col gap-1">
            {headings && first && <p className={cn("text-xs font-semibold text-foreground", i > 0 && "pt-1")}>{heading}</p>}
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground" title={p.description}>
              {labelOf(k, p)}
              {p.untested && (
                <span title={UNTESTED_NOTE} className="rounded-full border border-amber-500/40 px-1.5 text-xs font-normal text-amber-600 dark:text-amber-400">
                  untested
                </span>
              )}
            </label>
            <ParamField name={k} prop={p} value={values[k]} onChange={(v) => onChange(k, v)} locked={locked?.[k]} allowed={narrowed?.[k]?.allowed} />
            {(locked?.[k] ?? narrowed?.[k]?.reason) && <p className="text-xs text-muted-foreground">{locked?.[k] ?? narrowed?.[k]?.reason}</p>}
          </div>
        )
      })}
    </div>
  )
}
