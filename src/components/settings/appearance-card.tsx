import { Check, Palette } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SKINS, setAppearance, useAppearance } from "@/lib/appearance"
import type { Skin } from "@/lib/appearance"
import { cn } from "@/lib/utils"

/** A tiny picture of each skin. The colors live in index.css so they stay the same in either mode. */
function Swatch({ skin }: { skin: Skin }) {
  return (
    <div className={cn("skin-pv-page skin-pv--" + skin, "relative h-14 w-full overflow-hidden rounded-lg")}>
      <div className="skin-pv-panel absolute left-1.5 top-1.5 h-9 w-12 rounded-md" />
      <div className="skin-pv-panel absolute right-1.5 top-1.5 h-6 w-6 rounded-md" />
      <div className="skin-pv-accent absolute bottom-1.5 left-3 h-1.5 w-6 rounded-full" />
    </div>
  )
}

/**
 * The three looks of light mode. Dark is one look and stays as it is, so choosing a skin while in dark mode
 * says so and offers to show it in light.
 */
export function AppearanceCard() {
  const { dark, skin } = useAppearance()
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-secondary p-4">
      <div className="flex items-center gap-2">
        <Palette className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">Appearance</span>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {SKINS.map((s) => {
          const on = skin === s.id
          return (
            <Button
              key={s.id}
              type="button"
              variant="ghost"
              onClick={() => setAppearance({ skin: s.id })}
              className={cn("h-auto flex-col items-stretch gap-2 rounded-xl border p-1.5 font-normal transition-all hover:-translate-y-0.5", on ? "border-select/60 bg-select/10 ring-1 ring-select/20" : "border-border")}
            >
              <Swatch skin={s.id} />
              <span className="flex items-center justify-between px-1 pb-0.5 text-xs font-medium text-foreground">
                {s.name}
                {on && <Check className="h-3 w-3" />}
              </span>
            </Button>
          )
        })}
      </div>
      <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{dark ? "Skins are for light mode. Dark stays as it is." : "Dark mode stays as it is."}</span>
        {dark && (
          <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" onClick={() => setAppearance({ dark: false })}>
            Preview in light
          </Button>
        )}
      </p>
    </div>
  )
}
