import * as React from "react"
import { AudioLines, Box, Building2, Film, Images, Palette, SkipBack, SkipForward, User, Volume2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ElementChip } from "@/components/elements/element-chip"
import type { ElementCategory, ElementItem } from "@/lib/elements/types"
import { cn } from "@/lib/utils"

export type SlotIcon = React.ComponentType<{ className?: string }>

/** A file or element that has been added: its own separate small round card. Click to take it out. */
function Thumb({ label, icon: Icon, frame, kind = "image", onClear }: { label: string; icon: SlotIcon; frame: { url: string; name?: string }; kind?: "image" | "video" | "audio"; onClear: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="group relative h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-secondary">
          {kind === "image" && !frame.url ? (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
            </div>
          ) : kind === "image" ? (
            <img src={frame.url} alt={label} className="h-full w-full object-cover" />
          ) : kind === "video" ? (
            <video src={frame.url} className="h-full w-full object-cover" muted preload="metadata" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Volume2 className="h-3.5 w-3.5" />
            </div>
          )}
          <span className="pointer-events-none absolute bottom-0 right-0 flex h-3 w-3 items-center justify-center rounded-full bg-background/90 text-foreground">
            <Icon className="h-2 w-2" />
          </span>
          <Button
            type="button"
            variant="secondary"
            size="iconSm"
            aria-label={`Remove ${label}`}
            onClick={onClear}
            className="absolute inset-0 h-full w-full rounded-full p-0 opacity-0 transition-opacity group-hover:opacity-90"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">{`${label}${frame.name ? `: ${frame.name}` : ""}`}</TooltipContent>
    </Tooltip>
  )
}

/**
 * A small, round, icon-only card. `stacked` makes it overlap its neighbours (the ref kinds). `blocked` or `full` mutes it, with the
 * reason in the tooltip. The name is only ever in the tooltip.
 */
function Card({ label, icon: Icon, onClick, muted, stacked }: { label: string; icon: SlotIcon; onClick: () => void; muted?: string; stacked?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button swallows the pointer, so the tooltip hangs on a wrapper */}
        <span className="inline-flex flex-shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            data-media-trigger
            data-muted={muted ? "true" : undefined}
            disabled={Boolean(muted)}
            onClick={onClick}
            className={cn(
              "h-7 w-7 rounded-full bg-secondary p-0 text-muted-foreground transition-transform hover:bg-accent hover:text-foreground",
              stacked && "ring-2 ring-card hover:z-10 hover:-translate-y-0.5",
              muted && "opacity-40",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{muted ? `${label}: ${muted}` : label}</TooltipContent>
    </Tooltip>
  )
}

interface Slot {
  frame: { url: string; name?: string } | null
  blocked?: string
  onPick: () => void
  onClear: () => void
}

export interface ReferenceBoxProps {
  /** Present only when the model has a start or end frame. Not shown otherwise. */
  start?: Slot
  end?: Slot
  /** Present only when the model takes a video or a sound to work from. Not shown otherwise. */
  video?: Slot & { label: string }
  audio?: Slot
  images?: {
    items: Array<{ id: string; url: string; name: string }>
    /** Pictures that come from Elements, counted against the same budget */
    fromElements: number
    limit: number
    blocked?: string
    onPick: () => void
    onRemove: (id: string) => void
  }
  /** Every chosen element: characters, places and things, and looks */
  elements: ElementItem[]
  onRemoveElement: (id: string) => void
  /** How this model reads each element, by element id, for its tooltip */
  reads?: Record<string, string>
  /** Elements this model cannot use at all, by element id: shown muted */
  mutedElements?: Set<string>
  /** Opens the Element picker on one kind */
  onOpenElements: (category: ElementCategory) => void
  /** Chat takes pictures but not Elements */
  elementsLocked?: boolean
  /** Brand kits: pick one and its logo and brand words go with the prompt. Not shown when the person has no kit. */
  brand?: { kits: Array<{ id: string; name: string; logo?: string }>; selectedId?: string; onSelect: (id: string | null) => void }
  /** The model takes no reference pictures: characters, locations, products and props are not offered. (Looks always are.) */
  picturesMuted?: string
}

/**
 * A slim strip behind the top edge of the composer, icons only, all small and round:
 *  - Start and End frame: two separate icons, only when the model has them.
 *  - Ref: one grouped, overlapping stack with a card for each kind the model supports (Image, Video, Audio, Character,
 *    Location/Product/Prop, Looks). A kind the model does not support is not there.
 *  - What you add shows as its own separate cards beside the stack, not folded into it.
 * Names are only in the tooltips. The composer's `+` opens the full picker with unsupported kinds muted. The bottom padding is
 * hidden behind the card.
 */
export function ReferenceBox({ start, end, video, audio, images, elements, onRemoveElement, reads, mutedElements, onOpenElements, elementsLocked, picturesMuted, brand }: ReferenceBoxProps) {
  const used = images ? images.items.length + images.fromElements : 0
  const imagesFull = images ? (images.blocked ?? (used >= images.limit ? `${used}/${images.limit}` : undefined)) : undefined
  const showElements = !elementsLocked

  const kinds = [
    images && <Card key="images" stacked label="Reference images" icon={Images} muted={imagesFull} onClick={images.onPick} />,
    video && <Card key="video" stacked label={video.label} icon={Film} onClick={video.onPick} />,
    audio && <Card key="audio" stacked label="Reference audio" icon={AudioLines} onClick={audio.onPick} />,
    showElements && !picturesMuted && <Card key="character" stacked label="Character" icon={User} onClick={() => onOpenElements("character")} />,
    showElements && !picturesMuted && <Card key="product" stacked label="Location, Product, Prop" icon={Box} onClick={() => onOpenElements("product")} />,
    showElements && <Card key="camera" stacked label="Camera, Light, Style, Effects" icon={Palette} onClick={() => onOpenElements("camera")} />,
  ].filter(Boolean)

  const chosenBrand = brand?.kits.find((k) => k.id === brand.selectedId)
  const brandCard = brand && brand.kits.length > 0 && !chosenBrand && !elementsLocked && (
    <DropdownMenu key="brand">
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Brand kit" className="h-7 w-7 flex-shrink-0 rounded-full bg-secondary p-0 text-muted-foreground ring-2 ring-card hover:z-10 hover:-translate-y-0.5 hover:bg-accent hover:text-foreground">
              <Building2 className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Brand kit: its logo and colors go with the prompt</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" side="top" className="max-h-64 overflow-y-auto">
        {brand.kits.map((k) => (
          <DropdownMenuItem key={k.id} onSelect={() => brand.onSelect(k.id)} className="gap-2 text-xs">
            {k.logo ? <img src={k.logo} alt="" className="h-4 w-4 rounded-sm object-contain" /> : <Building2 className="h-4 w-4" />}
            {k.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
  if (brandCard) kinds.push(brandCard)

  const added = (chosenBrand ? 1 : 0) + (start?.frame ? 1 : 0) + (end?.frame ? 1 : 0) + (images?.items.length ?? 0) + (video?.frame ? 1 : 0) + (audio?.frame ? 1 : 0) + elements.length
  if (!start && !end && kinds.length === 0 && added === 0) return null

  return (
    <div className="flex max-w-full flex-wrap items-end gap-2" data-testid="reference-box">
      {start && (
        <Tab testId="reference-start">
          <Card label="Start frame" icon={SkipBack} muted={start.blocked} onClick={start.onPick} />
        </Tab>
      )}
      {end && (
        <Tab testId="reference-end">
          <Card label="End frame" icon={SkipForward} muted={end.blocked} onClick={end.onPick} />
        </Tab>
      )}
      {kinds.length > 0 && (
        <Tab testId="reference-kinds">
          <div className="flex items-center -space-x-2">{kinds}</div>
        </Tab>
      )}
      {/* What has been added: each one its own separate card */}
      {start?.frame && (
        <Tab>
          <Thumb label="Start frame" icon={SkipBack} frame={start.frame} onClear={start.onClear} />
        </Tab>
      )}
      {end?.frame && (
        <Tab>
          <Thumb label="End frame" icon={SkipForward} frame={end.frame} onClear={end.onClear} />
        </Tab>
      )}
      {images?.items.map((r) => (
        <Tab key={r.id}>
          <Thumb label="Reference image" icon={Images} frame={{ url: r.url, name: r.name }} onClear={() => images.onRemove(r.id)} />
        </Tab>
      ))}
      {video?.frame && (
        <Tab>
          <Thumb label={video.label} icon={Film} kind="video" frame={video.frame} onClear={video.onClear} />
        </Tab>
      )}
      {audio?.frame && (
        <Tab>
          <Thumb label="Reference audio" icon={AudioLines} kind="audio" frame={audio.frame} onClear={audio.onClear} />
        </Tab>
      )}
      {chosenBrand && brand && (
        <Tab>
          <Thumb label="Brand kit" icon={Building2} frame={{ url: chosenBrand.logo ?? "", name: chosenBrand.name }} onClear={() => brand.onSelect(null)} />
        </Tab>
      )}
      {elements.map((e) => (
        <Tab key={e.id}>
          <ElementChip element={e} reads={reads?.[e.id]} muted={mutedElements?.has(e.id)} onRemove={() => onRemoveElement(e.id)} />
        </Tab>
      ))}
    </div>
  )
}

/** One separate card behind the top edge of the composer: its own small container. The bottom padding is hidden behind the composer. */
function Tab({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <div className="inline-flex items-center rounded-t-2xl border border-b-0 border-border/50 bg-secondary/40 px-2 pb-4 pt-2 animate-in fade-in slide-in-from-bottom-1 duration-150" data-testid={testId}>
      {children}
    </div>
  )
}
