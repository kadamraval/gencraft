import { Box, Camera, MapPin, Package, Palette, Sparkles, Sun, User, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CATEGORY_LABEL } from "@/lib/elements/types"
import type { ElementCategory, ElementItem } from "@/lib/elements/types"

const ICON: Record<ElementCategory, LucideIcon> = {
  character: User,
  location: MapPin,
  product: Package,
  prop: Box,
  camera: Camera,
  light: Sun,
  style: Palette,
  effects: Sparkles,
}

/** A chosen element in the composer: its image if it has one, otherwise its category icon. The name and words are in the tooltip. */
export function ElementChip({ element, onRemove, reads, muted }: { element: ElementItem; onRemove: () => void; /** How the chosen model uses it, in a few words */ reads?: string; /** The model cannot use it: shown dimmed */ muted?: boolean }) {
  const Icon = ICON[element.category]
  const image = element.imageUrls[0]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`group relative flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary ring-2 ring-card transition-transform hover:z-10 hover:-translate-y-0.5 ${muted ? "opacity-40 grayscale" : ""}`}>
          {image ? <img src={image} alt={element.name} className="h-full w-full object-cover" /> : <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className="absolute bottom-0 right-0 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background/90">
            <Icon className="h-2 w-2 text-foreground" />
          </span>
          <Button
            type="button"
            variant="secondary"
            size="iconSm"
            aria-label={`Remove ${element.name}`}
            onClick={onRemove}
            className="absolute inset-0 h-full w-full rounded-full p-0 opacity-0 transition-opacity group-hover:opacity-90"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="font-medium">
          {CATEGORY_LABEL[element.category]}: {element.name}
        </div>
        {element.text && <div className="text-xs text-muted-foreground">{element.text}</div>}
        {reads && <div className="mt-1 text-xs text-foreground/80">{reads}</div>}
      </TooltipContent>
    </Tooltip>
  )
}
