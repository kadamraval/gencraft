import * as React from "react"
import { Box, Camera, ChevronRight, Globe, ImagePlus, Layers, Lightbulb, Loader2, MapPin, Package, Palette, Plus, Shapes, Sparkles, Trash2, Type, User, type LucideIcon } from "lucide-react"
import { BlankState } from "@/components/ui/blank-state"
import { Button } from "@/components/ui/button"
import { Field, FormDialog, IconTile, Rows } from "@/components/ui/form-rows"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ElementBuilder } from "@/components/elements/element-builder"
import { DEFAULT_STORY_ICON, storyIcon } from "@/components/story/story-icons"
import { loadFonts, face, paint } from "@/lib/brand/fonts"
import { pickLogo, useIsDark } from "@/lib/brand/logos"
import { shrinkImage } from "@/lib/brand/image"
import { readSite, type SiteBrand } from "@/lib/brand/site"
import { removeElement } from "@/lib/elements/store"
import { CATEGORY_LABEL, type ElementCategory, type ElementItem } from "@/lib/elements/types"
import { askYesNo, showNotice } from "@/lib/notice"
import { cn } from "@/lib/utils"
import type { SettingsState } from "@/types"
import type { BrandKit } from "@/types/brand"

export interface NewKit {
  name: string
  icon: string
  domain: string
  tagline: string
  logo?: string
  about?: string
  social?: Array<{ platform: string; url: string }>
}

interface Props {
  kits: BrandKit[]
  elements: ElementItem[]
  tab: "brand" | "elements"
  onTab: (tab: "brand" | "elements") => void
  onOpen: (id: string) => void
  onCreate: (kit: NewKit) => void
  onDelete: (id: string) => void
  settings?: SettingsState
  onOpenSettings?: (tab?: string) => void
}

const INTRO = {
  art: { image: "06_brand.png" },
  title: "Brand",
  line: "Keep your brand's look in one place, and the people, places and things you reuse.",
  steps: [
    { icon: Palette, title: "Add a brand kit", text: "Logo, colors, fonts, products and rules for one brand." },
    { icon: Shapes, title: "Add elements", text: "Characters, locations, products, props and looks you reuse in every prompt." },
    { icon: Sparkles, title: "Let the agent help", text: "Ask it to suggest a palette, pair fonts or write the rules." },
  ],
} as const

const CATEGORY_ICON: Record<ElementCategory, LucideIcon> = {
  character: User,
  location: MapPin,
  product: Package,
  prop: Box,
  camera: Camera,
  light: Lightbulb,
  style: Palette,
  effects: Sparkles,
}
const CATEGORY_HINT: Record<ElementCategory, string> = {
  character: "Pictures of a person or creature",
  location: "Pictures of a place",
  product: "Pictures of something you sell",
  prop: "Pictures of an object",
  camera: "Words for camera moves and lenses",
  light: "Words for lighting",
  style: "Words for a look or finish",
  effects: "Words for effects in the air",
}
const CATEGORIES = Object.keys(CATEGORY_LABEL) as ElementCategory[]

/** The window that makes a kit: a website to read the name and logo from, or a logo and name typed in by hand. */
function NewKitDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (k: NewKit) => void }) {
  const [site, setSite] = React.useState("")
  const [name, setName] = React.useState("")
  const [logo, setLogo] = React.useState<string | undefined>()
  const [found, setFound] = React.useState<SiteBrand | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const file = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (open) {
      setSite("")
      setName("")
      setLogo(undefined)
      setFound(null)
      setError("")
      setBusy(false)
    }
  }, [open])

  const fetchSite = async () => {
    if (!site.trim() || busy) return
    setBusy(true)
    setError("")
    try {
      const got = await readSite(site)
      setFound(got)
      setName(got.name)
      if (got.logo) setLogo(got.logo)
      else setError("Found the name, but no logo. Add one yourself.")
    } catch (e) {
      setError(`${e instanceof Error ? e.message : String(e)} Add the logo and name yourself.`)
    } finally {
      setBusy(false)
    }
  }

  const pick = async (f: File | undefined) => {
    if (!f) return
    try {
      setLogo(await shrinkImage(f, "logo"))
    } catch (e) {
      showNotice(e instanceof Error ? e.message : String(e))
    }
  }

  const create = () => {
    if (!name.trim()) return
    onCreate({ name: name.trim(), icon: DEFAULT_STORY_ICON, domain: found?.domain ?? site.trim(), tagline: "", logo, about: found?.description ?? "", social: found?.social ?? [] })
  }

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      icon={Palette}
      title="New brand kit"
      description="Read the name and logo from a website, or add them yourself."
      note={error}
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs">
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={!name.trim()} onClick={create} className="h-8 px-4 text-xs font-semibold">
            Create
          </Button>
        </>
      }
    >
      <Rows>
        <Field icon={Globe} label="Website">
          <div className="flex items-center gap-2">
            <Input
              value={site}
              onChange={(e) => setSite(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void fetchSite()
                }
              }}
              placeholder="www.yourwebsite.com"
              aria-label="Website"
              className="h-9 flex-1 text-xs"
            />
            <Button type="button" variant="secondary" size="sm" disabled={!site.trim() || busy} onClick={() => void fetchSite()} className="h-9 shrink-0 gap-1.5 text-xs">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Fetch
            </Button>
          </div>
        </Field>
        <Field icon={ImagePlus} label="Logo" top>
          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" aria-label={logo ? "Change the logo" : "Upload a logo"} onClick={() => file.current?.click()} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-dashed border-border bg-secondary/30 p-0 hover:bg-secondary/60">
              {logo ? <img src={logo} alt="Logo" className="h-full w-full object-contain p-2" /> : <ImagePlus className="h-5 w-5 text-muted-foreground" />}
            </Button>
            <Input
              ref={file}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ""
                void pick(f)
              }}
            />
            <div className="space-y-1">
              <Button type="button" variant="secondary" size="sm" onClick={() => file.current?.click()} className="h-8 text-xs">
                {logo ? "Change" : "Upload"}
              </Button>
              {logo && (
                <Button type="button" variant="link" onClick={() => setLogo(undefined)} className="block h-auto p-0 text-xs text-muted-foreground">
                  Remove
                </Button>
              )}
            </div>
          </div>
        </Field>
        <Field icon={Type} label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create()
            }}
            placeholder="Brand name"
            aria-label="Brand name"
            className="h-9 text-sm font-semibold"
          />
        </Field>
      </Rows>
    </FormDialog>
  )
}

/** The window that asks which kind of element, then shows the rows for it. */
function NewElementDialog({ open, onClose, settings, onOpenSettings }: { open: boolean; onClose: () => void; settings?: SettingsState; onOpenSettings?: (tab?: string) => void }) {
  const [category, setCategory] = React.useState<ElementCategory | null>(null)
  React.useEffect(() => {
    if (open) setCategory(null)
  }, [open])
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      icon={category ? CATEGORY_ICON[category] : Layers}
      title={category ? `New ${CATEGORY_LABEL[category].toLowerCase()}` : "New element"}
      description={category ? CATEGORY_HINT[category] : "What kind of element is it?"}
    >
      {category === null ? (
        <Rows className="-my-2">
          {CATEGORIES.map((c) => (
            <Button key={c} type="button" variant="ghost" onClick={() => setCategory(c)} className="flex h-auto w-full items-center justify-start gap-3 rounded-none px-0 py-2.5 text-left font-normal hover:bg-transparent hover:text-foreground">
              <IconTile icon={CATEGORY_ICON[c]} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-foreground">{CATEGORY_LABEL[c]}</span>
                <span className="block truncate text-xs text-muted-foreground">{CATEGORY_HINT[c]}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>
          ))}
        </Rows>
      ) : (
        <ElementBuilder plain category={category} settings={settings} onOpenSettings={onOpenSettings} onSaved={onClose} onCancel={() => setCategory(null)} />
      )}
    </FormDialog>
  )
}

const headingOf = (k: BrandKit) => k.typography.find((t) => t.role === "heading")?.fontFamily ?? k.typography[0]?.fontFamily

/** One kit: the logo filling its panel, then the name and the colors. Nothing else. */
function KitCard({ kit, onOpen, onDelete }: { kit: BrandKit; onOpen: () => void; onDelete: () => void }) {
  const Icon = storyIcon(kit.icon)
  const dark = useIsDark()
  const logo = pickLogo(kit, dark)?.url
  React.useEffect(() => {
    const f = headingOf(kit)
    if (f) loadFonts([f])
  }, [kit])
  return (
    <div className="group relative">
      <Button
        type="button"
        variant="ghost"
        onClick={onOpen}
        className="flex h-auto w-full flex-col items-stretch justify-start gap-0 overflow-hidden whitespace-normal rounded-2xl border border-border/70 bg-card p-0 text-left font-normal transition-all hover:-translate-y-0.5 hover:bg-card hover:shadow-lg"
      >
        <span className="flex aspect-video items-center justify-center bg-secondary/40 p-5">
          {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <Icon className="h-10 w-10 text-muted-foreground" />}
        </span>
        <span className="flex items-center justify-between gap-2 border-t border-border/60 p-3">
          <span className="min-w-0 truncate text-sm font-semibold text-foreground" style={face(headingOf(kit))}>
            {kit.name}
          </span>
          <span className="flex shrink-0 items-center -space-x-1">
            {kit.colors.slice(0, 5).map((c) => (
              <span key={c.id} className="h-4 w-4 rounded-full border-2 border-card" style={paint(c.hex)} />
            ))}
          </span>
        </span>
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Delete ${kit.name}`}
            onClick={onDelete}
            className="absolute right-2 top-2 h-7 w-7 rounded-lg bg-background/80 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Delete</TooltipContent>
      </Tooltip>
    </div>
  )
}

function ElementCard({ item, onDelete }: { item: ElementItem; onDelete: () => void }) {
  const I = CATEGORY_ICON[item.category]
  const image = item.imageUrls[0]
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative flex aspect-square items-center justify-center bg-secondary/40">
        {image ? (
          <img src={image} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <p className="line-clamp-5 px-3 text-center text-xs leading-relaxed text-muted-foreground">{item.text}</p>
        )}
        {item.imageUrls.length > 1 && <span className="absolute bottom-2 right-2 rounded-md bg-background/80 px-1.5 py-0.5 font-mono text-xs text-foreground">{item.imageUrls.length}</span>}
      </div>
      <div className="flex items-center gap-2 border-t border-border/60 p-3">
        <IconTile icon={I} className="h-7 w-7" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">{item.name}</p>
          <p className="text-xs text-muted-foreground">{CATEGORY_LABEL[item.category]}</p>
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Delete ${item.name}`}
            onClick={onDelete}
            className="absolute right-2 top-2 h-7 w-7 rounded-lg bg-background/80 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Delete</TooltipContent>
      </Tooltip>
    </div>
  )
}

/** The small blank state inside a tab that has nothing yet */
function NoneYet({ icon: Icon, title, line, action }: { icon: LucideIcon; title: string; line: string; action: React.ReactNode }) {
  return (
    <div className="mx-auto flex flex-col items-center gap-3 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card shadow-md">
        <Icon className="h-7 w-7 text-foreground" />
      </span>
      <div className="space-y-0.5">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="max-w-xs text-xs text-muted-foreground">{line}</p>
      </div>
      {action}
    </div>
  )
}

/**
 * The Brand page before a kit is opened. With nothing yet it is the shared blank state with Add brand kit and Add
 * element. After that it has two tabs, Brand kits and Elements, each a grid of cards with its own Add button.
 */
export function BrandLibrary({ kits, elements, tab, onTab, onOpen, onCreate, onDelete, settings, onOpenSettings }: Props) {
  const [creatingKit, setCreatingKit] = React.useState(false)
  const [creatingElement, setCreatingElement] = React.useState(false)
  const [filter, setFilter] = React.useState<ElementCategory | "all">("all")

  const removeKit = async (k: BrandKit) => {
    const yes = await askYesNo("Delete this brand kit?", `"${k.name}" with its logos, colors, fonts and images will be removed from this device.`)
    if (yes) onDelete(k.id)
  }
  const removeEl = async (e: ElementItem) => {
    const yes = await askYesNo("Delete this element?", `"${e.name}" will be removed from this device. Prompts that already used it keep working.`)
    if (yes) await removeElement(e.id)
  }

  const addKit = (
    <Button type="button" onClick={() => setCreatingKit(true)} className="h-9 gap-2 rounded-xl px-5 text-xs font-semibold">
      <Plus className="h-4 w-4" />
      Add brand kit
    </Button>
  )
  const addElement = (variant: "default" | "secondary") => (
    <Button type="button" variant={variant} onClick={() => setCreatingElement(true)} className="h-9 gap-2 rounded-xl px-5 text-xs font-semibold">
      <Plus className="h-4 w-4" />
      Add element
    </Button>
  )

  const shown = filter === "all" ? elements : elements.filter((e) => e.category === filter)
  const usedCategories = CATEGORIES.filter((c) => elements.some((e) => e.category === c))

  return (
    <TooltipProvider delayDuration={150}>
      <div className="h-full w-full overflow-y-auto no-scrollbar">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-6 pb-24 pt-4">
        <NewKitDialog
          open={creatingKit}
          onClose={() => setCreatingKit(false)}
          onCreate={(k) => {
            onCreate(k)
            setCreatingKit(false)
          }}
        />
        <NewElementDialog open={creatingElement} onClose={() => setCreatingElement(false)} settings={settings} onOpenSettings={onOpenSettings} />

        {kits.length === 0 && elements.length === 0 ? (
          <div className="flex flex-1 items-center">
            <BlankState
              {...INTRO}
              steps={[...INTRO.steps]}
              action={
                <div className="flex items-center gap-2">
                  {addKit}
                  {addElement("secondary")}
                </div>
              }
            />
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <Tabs value={tab} onValueChange={(v) => onTab(v as "brand" | "elements")}>
                <TabsList>
                  <TabsTrigger value="brand" className="gap-1.5">
                    <Palette className="h-3.5 w-3.5" />
                    Brand kits
                    <span className="font-mono text-muted-foreground">{kits.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="elements" className="gap-1.5">
                    <Layers className="h-3.5 w-3.5" />
                    Elements
                    <span className="font-mono text-muted-foreground">{elements.length}</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {(tab === "brand" ? kits.length : elements.length) > 0 && (tab === "brand" ? addKit : addElement("default"))}
            </div>

            {tab === "brand" ? (
              kits.length === 0 ? (
                <NoneYet icon={Palette} title="No brand kits yet" line="A kit holds one brand's logo, colors, fonts, products and rules." action={addKit} />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {kits.map((k) => (
                    <KitCard key={k.id} kit={k} onOpen={() => onOpen(k.id)} onDelete={() => void removeKit(k)} />
                  ))}
                </div>
              )
            ) : elements.length === 0 ? (
              <NoneYet icon={Layers} title="No elements yet" line="Elements are the characters, places, products and looks you reuse in prompts." action={addElement("default")} />
            ) : (
              <>
                {usedCategories.length > 1 && (
                  <div className="mb-3 flex flex-wrap items-center gap-1.5">
                    {(["all", ...usedCategories] as const).map((c) => (
                      <Button
                        key={c}
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFilter(c)}
                        className={cn("h-7 rounded-full border px-3 text-xs", filter === c ? "border-select/60 bg-select/10 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground")}
                      >
                        {c === "all" ? "All" : CATEGORY_LABEL[c]}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {shown.map((e) => (
                    <ElementCard key={e.id} item={e} onDelete={() => void removeEl(e)} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
      </div>
    </TooltipProvider>
  )
}
