import * as React from "react"
import { ArrowLeft, ArrowUp, Check, FileText, Folder, Globe, Hash, ImagePlus, Layers, LayoutTemplate, ListChecks, Loader2, Package, Palette, Plus, RectangleHorizontal, Search, Share2, Sparkles, Tag, Trash2, Type, User, Wand2, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FormCard, FormDialog, IconTile, Rows, TEXT_BOX } from "@/components/ui/form-rows"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { storyIcon } from "@/components/story/story-icons"
import { OP_FORMAT, applyBrandOps, describeKit, parseBrandOps } from "@/lib/brand/brand-ops"
import { LOGO_TAGS, logoTagLabel, pickLogo, useIsDark } from "@/lib/brand/logos"
import { AGENT_WIDTH, AgentAside, AgentDivider, DockRightButton, useAgentColumn } from "@/components/layout/agent-aside"
import { SocialIcon, socialHref } from "@/components/brand/social-icons"
import { openExternal } from "@/lib/registry/net"
import { FONT_KINDS, GOOGLE_FONTS, face, ink, loadFonts, paint, readableOn, type FontKind } from "@/lib/brand/fonts"
import { shrinkImage } from "@/lib/brand/image"
import { SOCIAL_PLATFORMS } from "@/lib/brand/site"
import { showNotice } from "@/lib/notice"
import { cn } from "@/lib/utils"
import type { BrandColorItem, BrandKit, BrandLogoItem, BrandProductItem, BrandTemplate, BrandTypographyItem } from "@/types/brand"

interface Props {
  kit: BrandKit
  /** False when the browser refused to keep the kit */
  saved: boolean
  onChange: (kit: BrandKit) => void
  onBack: () => void
  onGenerateText?: (prompt: string) => Promise<string>
}

const COLOR_ROLES: Array<{ id: BrandColorItem["role"]; label: string }> = [
  { id: "primary", label: "Primary" },
  { id: "secondary", label: "Secondary" },
  { id: "accent", label: "Accent" },
  { id: "background", label: "Background" },
  { id: "surface", label: "Surface" },
]

const NEW_HEX = "#10B981" // allow-color
const BLACK = "#000000" // allow-color
const COLOR_PRESETS = ["#0B0B0E", "#FFFFFF", "#E4E5E7", "#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#F43F5E", "#06B6D4"] // allow-color

const FONT_SLOTS: Array<{ role: BrandTypographyItem["role"]; label: string; hint: string }> = [
  { role: "heading", label: "Heading", hint: "Titles and big text" },
  { role: "body", label: "Body", hint: "Paragraphs and captions" },
  { role: "accent", label: "Accent", hint: "Quotes and highlights" },
  { role: "mono", label: "Mono", hint: "Numbers and code" },
]

const RATIOS = ["1:1", "4:5", "9:16", "16:9", "3:2", "21:9"]

const RULE_IDEAS = ["Soft natural light, no harsh shadows", "Wide 2.39:1 cinematic frame", "No text or logos inside the picture", "Muted colors, never neon", "Keep the same wardrobe across shots", "Slow, steady camera moves"]

const PROMPT_IDEAS = ["Suggest a color palette", "Pair a heading and body font", "Write three directing rules", "Write a tagline"]

const fontOf = (kit: BrandKit, role: BrandTypographyItem["role"]) => kit.typography.find((t) => t.role === role)?.fontFamily
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

/** One group of the kit as a card: icon, title and a short line, one small button, a divider, then the details */
function Section({ icon, title, hint, action, children }: { icon: LucideIcon; title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <FormCard icon={icon} title={title} hint={hint} action={action}>
      <div className="space-y-4">{children}</div>
    </FormCard>
  )
}

const addButton = (label: string, onClick: () => void) => (
  <Button type="button" variant="secondary" size="sm" onClick={onClick} className="h-7 gap-1 px-2.5 text-xs">
    <Plus className="h-3.5 w-3.5" />
    {label}
  </Button>
)

/** A dashed tile that opens the file chooser and hands back shrunk pictures and their file names */
function UploadTile({ kind, multiple, label, onPick, className }: { kind: "logo" | "photo"; multiple?: boolean; label: string; onPick: (urls: string[], names: string[]) => void; className?: string }) {
  const input = React.useRef<HTMLInputElement>(null)
  const take = async (files: File[]) => {
    const urls: string[] = []
    const names: string[] = []
    for (const f of files) {
      try {
        urls.push(await shrinkImage(f, kind))
        names.push(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim())
      } catch (e) {
        showNotice(e instanceof Error ? e.message : String(e))
      }
    }
    if (urls.length) onPick(urls, names)
  }
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" aria-label={label} onClick={() => input.current?.click()} className={cn("flex flex-col gap-1 rounded-xl border border-dashed border-border bg-secondary/20 text-muted-foreground hover:bg-secondary/50 hover:text-foreground", className)}>
            <ImagePlus className="h-5 w-5" />
            <span className="text-xs">Add</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <Input
        ref={input}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ""
          void take(files)
        }}
      />
    </>
  )
}

/** The top of the kit: a square logo for the current look, the name and colors, and icons for the website and social links */
function Preview({ kit }: { kit: BrandKit }) {
  const dark = useIsDark()
  const Icon = storyIcon(kit.icon)
  const logo = pickLogo(kit, dark)
  const links = (kit.social ?? []).filter((x) => x.url.trim())
  const site = kit.domain?.trim()
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border/70 bg-card p-4">
      <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-secondary/40 p-1.5">
        {logo ? <img src={logo.url} alt={kit.name} className="h-full w-full object-contain" /> : <Icon className="h-8 w-8 text-muted-foreground" />}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="truncate text-2xl font-bold leading-tight text-foreground" style={face(fontOf(kit, "heading"))}>
          {kit.name || "Untitled brand"}
        </p>
        <div className="flex items-center gap-1.5">
          {kit.colors.length === 0 ? <span className="text-xs text-muted-foreground/70">No colors yet</span> : kit.colors.map((c) => <span key={c.id} title={c.name} className="h-5 w-5 rounded-full border border-border/70" style={paint(c.hex)} />)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {site && (
          <LinkIcon label={site} href={/^https?:\/\//i.test(site) ? site : `https://${site}`}>
            <Globe className="h-4 w-4" />
          </LinkIcon>
        )}
        {links.map((x) => (
          <LinkIcon key={x.id} label={x.platform} href={socialHref(x.platform, x.url)}>
            <SocialIcon platform={x.platform} className="h-4 w-4" />
          </LinkIcon>
        ))}
      </div>
    </div>
  )
}

/** An icon that opens a link in the browser */
function LinkIcon({ label, href, children }: { label: string; href: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={() => void openExternal(href)} className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:text-foreground">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** One logo shown as a plain picture. A light dashed "Add tag" sits below it; once a tag is chosen that goes away and the tag shows on hover. */
function LogoTile({ logo, onTag, onRemove }: { logo: BrandLogoItem; onTag: (tag: string | undefined) => void; onRemove: () => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="group relative w-28 space-y-1.5">
        <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-secondary/40 p-2">
          <img src={logo.url} alt={logoTagLabel(logo.tag) || "Logo"} className="h-full w-full object-contain" />
          <Button type="button" variant="ghost" size="icon" aria-label="Remove logo" onClick={onRemove} className="absolute right-1 top-1 h-6 w-6 rounded-md bg-background/80 p-0 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100">
            <Trash2 className="h-3 w-3" />
          </Button>
          {logo.tag && (
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" aria-label="Change tag" className="absolute inset-x-1.5 bottom-1.5 h-6 justify-center truncate rounded-md bg-background/85 px-2 text-xs font-medium text-foreground opacity-0 group-hover:opacity-100">
                {logoTagLabel(logo.tag)}
              </Button>
            </PopoverTrigger>
          )}
        </div>
        {!logo.tag && (
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" className="h-6 w-full rounded-md border border-dashed border-border/60 px-2 text-xs font-normal text-muted-foreground/70 hover:text-foreground">
              Add tag
            </Button>
          </PopoverTrigger>
        )}
      </div>
      <PopoverContent align="start" className="w-64 p-1">
        {LOGO_TAGS.map((t) => (
          <Button
            key={t.id}
            type="button"
            variant="ghost"
            onClick={() => {
              onTag(t.id)
              setOpen(false)
            }}
            className={cn("flex h-auto w-full items-center justify-start gap-2 rounded-lg px-2.5 py-2 text-left font-normal", logo.tag === t.id && "bg-secondary")}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-foreground">{t.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{t.hint}</span>
            </span>
            {logo.tag === t.id && <Check className="h-3.5 w-3.5 shrink-0" />}
          </Button>
        ))}
        {logo.tag && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onTag(undefined)
              setOpen(false)
            }}
            className="h-8 w-full justify-start rounded-lg px-2.5 text-xs font-normal text-muted-foreground"
          >
            No tag
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** The card and editor for one color. With no color given it adds a new one. */
function ColorSwatch({ color, onSave, onRemove }: { color?: BrandColorItem; onSave: (c: Omit<BrandColorItem, "id">) => void; onRemove?: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [hex, setHex] = React.useState(color?.hex ?? NEW_HEX)
  const [name, setName] = React.useState(color?.name ?? "")
  const [role, setRole] = React.useState<BrandColorItem["role"]>(color?.role ?? "accent")
  React.useEffect(() => {
    if (open) {
      setHex(color?.hex ?? NEW_HEX)
      setName(color?.name ?? "")
      setRole(color?.role ?? "accent")
    }
  }, [open, color])
  const valid = /^#[0-9a-f]{6}$/i.test(hex)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {color ? (
          <Button type="button" variant="ghost" aria-label={`Edit ${color.name}`} className="flex h-28 w-full flex-col items-start justify-end gap-0 rounded-xl border border-border/70 p-3 text-left hover:opacity-90" style={paint(color.hex)}>
            <span className="max-w-full truncate text-xs font-semibold" style={ink(readableOn(color.hex))}>
              {color.name}
            </span>
            <span className="font-mono text-xs opacity-80" style={ink(readableOn(color.hex))}>
              {color.hex.toUpperCase()}
            </span>
            <span className="text-xs capitalize opacity-70" style={ink(readableOn(color.hex))}>
              {color.role}
            </span>
          </Button>
        ) : (
          <Button type="button" variant="ghost" aria-label="Add a color" className="flex h-28 w-full flex-col gap-1 rounded-xl border border-dashed border-border bg-secondary/20 text-muted-foreground hover:bg-secondary/50 hover:text-foreground">
            <Plus className="h-5 w-5" />
            <span className="text-xs">Color</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <IconTile icon={Palette} className="h-7 w-7" />
          <span className="text-xs font-semibold text-foreground">{color ? "Edit color" : "New color"}</span>
        </div>
        <Rows className="border-t border-border/60 px-4 py-3">
          <Field icon={Hash} label="Color">
            <div className="flex items-center gap-2">
              <Input type="color" aria-label="Pick a color" value={valid ? hex : BLACK} onChange={(e) => setHex(e.target.value)} className="h-8 w-10 cursor-pointer rounded-lg border border-border bg-transparent p-1" />
              <Input aria-label="Hex" value={hex} onChange={(e) => setHex(e.target.value)} placeholder={NEW_HEX} className="h-8 flex-1 font-mono text-xs uppercase" />
            </div>
          </Field>
          <Field icon={Palette} label="Presets">
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map((p) => (
                <Button key={p} type="button" variant="ghost" size="icon" aria-label={p} onClick={() => setHex(p)} className="h-5 w-5 rounded-full border border-border/80 p-0 hover:scale-110" style={paint(p)} />
              ))}
            </div>
          </Field>
          <Field icon={Tag} label="Name">
            <Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ocean" className="h-8 text-xs" />
          </Field>
          <Field icon={Layers} label="Role">
            <Select value={role} onValueChange={(v) => setRole(v as BrandColorItem["role"])}>
              <SelectTrigger aria-label="Role" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLOR_ROLES.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="text-xs">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Rows>
        <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-secondary/20 px-4 py-2.5">
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onRemove()
                setOpen(false)
              }}
              className="h-8 gap-1 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            size="sm"
            disabled={!valid}
            onClick={() => {
              onSave({ hex: hex.toUpperCase(), name: name.trim() || hex.toUpperCase(), role })
              setOpen(false)
            }}
            className="h-8 px-4 text-xs font-semibold"
          >
            {color ? "Save" : "Add"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** A font role as a card: "Aa" set in the chosen font, and a searchable list of every Google Font to choose from */
function FontSlot({ slot, family, onPick, onClear }: { slot: (typeof FONT_SLOTS)[number]; family?: string; onPick: (family: string) => void; onClear: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [kind, setKind] = React.useState<FontKind | "all">("all")
  const [limit, setLimit] = React.useState(40)
  React.useEffect(() => {
    if (open) {
      setQuery("")
      setKind("all")
      setLimit(40)
    }
  }, [open])
  const q = query.trim().toLowerCase()
  const matches = React.useMemo(() => GOOGLE_FONTS.filter(([name, k]) => (kind === "all" || k === kind) && name.toLowerCase().includes(q)), [q, kind])
  const shown = matches.slice(0, limit)
  React.useEffect(() => {
    if (open) loadFonts(shown.map(([n]) => n))
  }, [open, shown])
  const choose = (f: string) => {
    loadFonts([f])
    onPick(f)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" aria-label={`${slot.label} font`} className="flex h-auto w-full flex-col items-start gap-0 whitespace-normal rounded-xl border border-border/70 bg-card p-4 text-left hover:bg-card hover:shadow-md">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{slot.label}</span>
          {family ? (
            <>
              <span className="mt-1 text-5xl leading-tight text-foreground" style={face(family)}>
                Aa
              </span>
              <span className="text-sm font-semibold text-foreground">{family}</span>
              <span className="mt-1 line-clamp-1 text-xs text-muted-foreground" style={face(family)}>
                The quick brown fox jumps over the lazy dog
              </span>
            </>
          ) : (
            <>
              <span className="mt-1 flex h-14 items-center text-muted-foreground">
                <Plus className="h-6 w-6" />
              </span>
              <span className="text-xs text-muted-foreground">{slot.hint}</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(40)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) choose(matches[0]?.[0] ?? query.trim())
            }}
            placeholder={`Search ${GOOGLE_FONTS.length} Google Fonts`}
            aria-label="Search fonts"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FONT_KINDS.map((k) => (
            <Button key={k.id} type="button" variant="ghost" size="sm" onClick={() => setKind(k.id)} className={cn("h-6 rounded-full border px-2.5 text-xs", kind === k.id ? "border-select/60 bg-select/10 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground")}>
              {k.label}
            </Button>
          ))}
        </div>
        <div className="max-h-64 space-y-0.5 overflow-y-auto no-scrollbar">
          {shown.map(([f]) => (
            <Button key={f} type="button" variant="ghost" onClick={() => choose(f)} className={cn("h-9 w-full justify-start rounded-lg px-2 text-base font-normal", f === family && "bg-secondary")} style={face(f)}>
              {f}
            </Button>
          ))}
          {matches.length > limit && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setLimit((n) => n + 60)} className="h-8 w-full text-xs text-muted-foreground">
              Show more ({matches.length - limit} left)
            </Button>
          )}
          {matches.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">No match. Press Enter to try "{query.trim()}" anyway.</p>}
        </div>
        {family && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onClear()
              setOpen(false)
            }}
            className="h-8 w-full justify-start gap-1.5 text-xs text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove the {slot.label.toLowerCase()} font
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Change one product: pictures, name, category and description, row by row */
function ProductDialog({ product, onClose, onSave, onRemove }: { product: BrandProductItem | null; onClose: () => void; onSave: (p: Omit<BrandProductItem, "id">) => void; onRemove: () => void }) {
  const [name, setName] = React.useState("")
  const [category, setCategory] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [images, setImages] = React.useState<string[]>([])
  React.useEffect(() => {
    if (product) {
      setName(product.name)
      setCategory(product.category)
      setDescription(product.description ?? "")
      setImages(product.images)
    }
  }, [product])
  return (
    <FormDialog
      open={product !== null}
      onClose={onClose}
      icon={Package}
      title="Edit product"
      description="Several pictures from different angles help models keep it looking the same."
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="h-8 gap-1 text-xs text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs">
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), category: category.trim() || "General", description: description.trim() || undefined, images })} className="h-8 px-4 text-xs font-semibold">
            Save
          </Button>
        </>
      }
    >
      <Rows>
        <Field icon={ImagePlus} label="Pictures" top>
          <div className="grid grid-cols-4 gap-2">
            {images.map((src, i) => (
              <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-border/60">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove picture" onClick={() => setImages((l) => l.filter((_, j) => j !== i))} className="absolute right-1 top-1 h-5 w-5 rounded-full bg-background/80 p-0 opacity-0 group-hover:opacity-100">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {images.length < 8 && <UploadTile kind="photo" multiple label="Add pictures" onPick={(u) => setImages((l) => [...l, ...u].slice(0, 8))} className="aspect-square h-auto" />}
          </div>
        </Field>
        <Field icon={Tag} label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" className="h-9 text-sm font-semibold" />
        </Field>
        <Field icon={Folder} label="Category">
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Coffee" aria-label="Category" className="h-9 text-xs" />
        </Field>
        <Field icon={FileText} label="Description" top>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it is, in a line or two" aria-label="Description" rows={3} className={cn("resize-none text-xs", TEXT_BOX)} />
        </Field>
      </Rows>
    </FormDialog>
  )
}

interface Row {
  id: string
  name: string
  category: string
  description: string
  image?: string
}

/** Several products at once: add pictures (each becomes a row named after its file) or rows by hand, then fill in name, category and description. */
function BulkProductsDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (items: Array<Omit<BrandProductItem, "id">>) => void }) {
  const [rows, setRows] = React.useState<Row[]>([])
  const [all, setAll] = React.useState("")
  React.useEffect(() => {
    if (open) {
      setRows([])
      setAll("")
    }
  }, [open])
  const patch = (id: string, change: Partial<Row>) => setRows((l) => l.map((r) => (r.id === id ? { ...r, ...change } : r)))
  const ready = rows.filter((r) => r.name.trim())
  return (
    <FormDialog
      wide
      open={open}
      onClose={onClose}
      icon={Package}
      title="Add products"
      description="Add pictures and each becomes a product. Name and describe them below."
      note={rows.length > ready.length ? `${rows.length - ready.length} without a name will be skipped` : ""}
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs">
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={ready.length === 0} onClick={() => onSave(ready.map((r) => ({ name: r.name.trim(), category: r.category.trim() || "General", description: r.description.trim() || undefined, images: r.image ? [r.image] : [] })))} className="h-8 px-4 text-xs font-semibold">
            Add {ready.length || ""} {ready.length === 1 ? "product" : "products"}
          </Button>
        </>
      }
    >
      <div className="-mt-1 mb-3 flex items-center gap-2">
        <UploadTile kind="photo" multiple label="Add pictures" className="h-8 w-auto flex-row px-3" onPick={(urls, names) => setRows((l) => [...l, ...urls.map((image, i) => ({ id: stamp(), name: names[i] ?? "", category: all, description: "", image }))])} />
        <Button type="button" variant="secondary" size="sm" onClick={() => setRows((l) => [...l, { id: stamp(), name: "", category: all, description: "" }])} className="h-8 gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Add a row
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Folder className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={all}
            onChange={(e) => {
              const next = e.target.value
              setRows((l) => l.map((r) => (r.category === all ? { ...r, category: next } : r)))
              setAll(next)
            }}
            placeholder="Category for all"
            aria-label="Category for all"
            className="h-8 w-40 text-xs"
          />
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border/70">
        <div className="grid grid-cols-[3rem_minmax(0,1fr)_8rem_minmax(0,1.4fr)_1.75rem] items-center gap-2 border-b border-border/60 bg-secondary/30 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span />
          <span>Name</span>
          <span>Category</span>
          <span>Description</span>
          <span />
        </div>
        {rows.length === 0 && <p className="py-10 text-center text-xs text-muted-foreground">Add pictures or a row to begin.</p>}
        <div className="max-h-72 divide-y divide-border/50 overflow-y-auto no-scrollbar">
          {rows.map((r) => (
            <div key={r.id} className="grid grid-cols-[3rem_minmax(0,1fr)_8rem_minmax(0,1.4fr)_1.75rem] items-center gap-2 px-3 py-2">
              <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-secondary/40">
                {r.image ? <img src={r.image} alt="" className="h-full w-full object-cover" /> : <Package className="h-4 w-4 text-muted-foreground/50" />}
              </span>
              <Input value={r.name} onChange={(e) => patch(r.id, { name: e.target.value })} placeholder="Name" aria-label="Product name" className="h-8 text-xs font-semibold" />
              <Input value={r.category} onChange={(e) => patch(r.id, { category: e.target.value })} placeholder="Category" aria-label="Category" className="h-8 text-xs" />
              <Input value={r.description} onChange={(e) => patch(r.id, { description: e.target.value })} placeholder="Description" aria-label="Description" className="h-8 text-xs" />
              <Button type="button" variant="ghost" size="icon" aria-label="Remove row" onClick={() => setRows((l) => l.filter((x) => x.id !== r.id))} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </FormDialog>
  )
}

/** A reusable starting prompt for the brand. `template` is null for a new one. */
function TemplateDialog({ open, template, onClose, onSave, onRemove }: { open: boolean; template: BrandTemplate | null; onClose: () => void; onSave: (t: Omit<BrandTemplate, "id">) => void; onRemove: () => void }) {
  const [name, setName] = React.useState("")
  const [ratio, setRatio] = React.useState("1:1")
  const [prompt, setPrompt] = React.useState("")
  React.useEffect(() => {
    if (open) {
      setName(template?.name ?? "")
      setRatio(template?.ratio ?? "1:1")
      setPrompt(template?.prompt ?? "")
    }
  }, [open, template])
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      icon={LayoutTemplate}
      title={template ? "Edit template" : "New template"}
      description="A starting prompt for this brand, such as a social post or a poster."
      note={'Write {brand} and {tagline} where the kit\'s name and tagline go.'}
      footer={
        <>
          {template && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="h-8 gap-1 text-xs text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs">
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={!name.trim() || !prompt.trim()} onClick={() => onSave({ name: name.trim(), ratio, prompt: prompt.trim() })} className="h-8 px-4 text-xs font-semibold">
            Save
          </Button>
        </>
      }
    >
      <Rows>
        <Field icon={Tag} label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Instagram post" aria-label="Template name" className="h-9 text-sm font-semibold" />
        </Field>
        <Field icon={RectangleHorizontal} label="Shape">
          <Select value={ratio} onValueChange={setRatio}>
            <SelectTrigger aria-label="Shape" className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RATIOS.map((r) => (
                <SelectItem key={r} value={r} className="text-xs">
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field icon={Type} label="Prompt" top>
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} placeholder="A bright product photo for {brand}, soft window light, plenty of empty space for text" aria-label="Prompt" className={cn("resize-none text-xs leading-relaxed", TEXT_BOX)} />
        </Field>
      </Rows>
    </FormDialog>
  )
}

/** A small rectangle in the shape of an aspect ratio */
function RatioShape({ ratio }: { ratio: string }) {
  const [w = 1, h = 1] = ratio.split(":").map(Number)
  const scale = 36 / Math.max(w, h)
  return <span className="block rounded-sm border border-select/50 bg-select/10" style={{ width: Math.round(w * scale), height: Math.round(h * scale) }} />
}

interface Message {
  id: string
  role: "you" | "agent"
  text: string
}

export function BrandWorkspace({ kit, saved, onChange, onBack, onGenerateText }: Props) {
  const [bulk, setBulk] = React.useState(false)
  const [product, setProduct] = React.useState<BrandProductItem | null>(null)
  const [template, setTemplate] = React.useState<BrandTemplate | "new" | null>(null)
  const [newRule, setNewRule] = React.useState("")
  const Icon = storyIcon(kit.icon)
  const dark = useIsDark()
  const small = pickLogo(kit, dark, true)

  const kitRef = React.useRef(kit)
  kitRef.current = kit
  const edit = (change: (k: BrandKit) => BrandKit) => onChange({ ...change(kitRef.current), updatedAt: new Date().toISOString() })

  // Fonts the kit already uses
  React.useEffect(() => {
    loadFonts(kit.typography.map((t) => t.fontFamily))
  }, [kit.typography])

  // ---- Right panel: the shared Agent column
  const col = useAgentColumn()

  // ---- Agent
  const [messages, setMessages] = React.useState<Message[]>([])
  const [draft, setDraft] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const feed = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight })
  }, [messages, busy])

  const say = (role: Message["role"], text: string) => setMessages((m) => [...m, { id: `${Date.now()}-${m.length}`, role, text }])

  const ask = async (text: string) => {
    const request = text.trim()
    if (!request || busy) return
    say("you", request)
    setDraft("")
    if (!onGenerateText) {
      say("agent", "The agent is not available in this window.")
      return
    }
    setBusy(true)
    try {
      const reply = await onGenerateText(`You are the brand director for a creative studio. Help with this brand kit.\n\nBrand kit:\n${describeKit(kitRef.current)}\n\nRequest: ${request}\n\n${OP_FORMAT}`)
      const done = applyBrandOps(kitRef.current, parseBrandOps(reply))
      if (done.changes.length > 0) edit(() => done.kit)
      const cut = reply.indexOf("[")
      const note = (cut >= 0 ? reply.slice(0, cut) : reply).replace(/```[a-z]*/gi, "").trim()
      const lines = [note, ...done.changes.map((c) => `• ${c}`)].filter(Boolean)
      if (done.skipped > 0) lines.push(`${done.skipped} suggestion${done.skipped === 1 ? " was" : "s were"} left out because they did not fit.`)
      say("agent", lines.join("\n") || "Nothing needed to change.")
    } catch (e) {
      say("agent", e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const addRule = (text: string) => {
    const t = text.trim()
    if (!t || kit.instructions.includes(t)) return
    edit((k) => ({ ...k, instructions: [...k.instructions, t] }))
  }
  const ideas = RULE_IDEAS.filter((r) => !kit.instructions.includes(r))
  const social = kit.social ?? []
  const templates = kit.templates ?? []

  const conversation = (
    <>
      {messages.length === 0 ? (
        <div className="space-y-3">
          <div className="space-y-1.5 rounded-xl border border-border/50 bg-secondary/40 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Sparkles className="h-3 w-3 text-primary" />
              {kit.name || "This brand"}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">Ask for colors, fonts, a tagline or rules. The agent changes the kit and tells you what it changed.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            {PROMPT_IDEAS.map((p) => (
              <Button key={p} type="button" variant="ghost" size="sm" onClick={() => void ask(p)} className="h-8 justify-start rounded-lg border border-border/40 bg-secondary/30 px-2.5 text-xs text-muted-foreground hover:text-foreground">
                {p}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        messages.map((m) => (
          <div key={m.id} className={cn("whitespace-pre-wrap rounded-xl border p-2.5 text-xs leading-relaxed", m.role === "agent" ? "border-border/50 bg-secondary/40 text-foreground" : "border-primary/20 bg-primary/10 font-medium text-foreground")}>
            <div className="mb-1 flex items-center gap-1 font-mono text-xs text-muted-foreground">
              {m.role === "agent" ? <Wand2 className="h-2.5 w-2.5 text-primary" /> : <User className="h-2.5 w-2.5" />}
              <span>{m.role === "agent" ? "Agent" : "You"}</span>
            </div>
            {m.text}
          </div>
        ))
      )}
      {busy && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Thinking
        </div>
      )}
    </>
  )

  const composer = (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void ask(draft)
      }}
    >
      <div className="flex items-end gap-1.5 rounded-xl border border-border/70 bg-card p-1.5">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void ask(draft)
            }
          }}
          rows={1}
          placeholder="Ask the agent about this brand"
          aria-label="Ask the agent"
          className="max-h-32 min-h-8 flex-1 resize-none border-0 bg-transparent px-1.5 py-1.5 text-xs shadow-none focus-visible:ring-0"
        />
        <Button type="submit" size="icon" disabled={!draft.trim() || busy} aria-label="Send" className="h-8 w-8 shrink-0 rounded-lg p-0">
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </form>
  )

  return (
    <TooltipProvider delayDuration={150}>
      <div ref={col.container} className="relative flex h-full w-full overflow-hidden bg-background/20 text-foreground">
        <BulkProductsDialog open={bulk} onClose={() => setBulk(false)} onSave={(items) => {
          edit((k) => ({ ...k, products: [...k.products, ...items.map((p) => ({ id: `prod-${stamp()}`, ...p }))] }))
          setBulk(false)
        }} />
        <ProductDialog
          product={product}
          onClose={() => setProduct(null)}
          onSave={(v) => {
            if (product) edit((k) => ({ ...k, products: k.products.map((p) => (p.id === product.id ? { ...p, ...v } : p)) }))
            setProduct(null)
          }}
          onRemove={() => {
            if (product) edit((k) => ({ ...k, products: k.products.filter((p) => p.id !== product.id) }))
            setProduct(null)
          }}
        />
        <TemplateDialog
          open={template !== null}
          template={template === "new" ? null : template}
          onClose={() => setTemplate(null)}
          onSave={(v) => {
            if (template === "new") edit((k) => ({ ...k, templates: [...(k.templates ?? []), { id: `tpl-${stamp()}`, ...v }] }))
            else if (template) edit((k) => ({ ...k, templates: (k.templates ?? []).map((t) => (t.id === template.id ? { ...t, ...v } : t)) }))
            setTemplate(null)
          }}
          onRemove={() => {
            if (template && template !== "new") edit((k) => ({ ...k, templates: (k.templates ?? []).filter((t) => t.id !== template.id) }))
            setTemplate(null)
          }}
        />

        <main className="flex h-full min-w-0 flex-1 flex-col">
          {/* Top bar: back to the kits, which kit, and whether it is kept */}
          <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/40 px-3.5">
            <div className="flex min-w-0 items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Back to brand kits" onClick={onBack} className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>All brand kits</TooltipContent>
              </Tooltip>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60">
                {small ? <img src={small.url} alt="" className="h-full w-full object-contain p-0.5" /> : <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
              </span>
              <span className="truncate text-xs font-bold text-foreground">{kit.name || "Untitled brand"}</span>
            </div>
            <span className={cn("shrink-0 text-xs", saved ? "text-muted-foreground" : "text-destructive")}>{saved ? "Saved" : "Not saved: this device is out of room. Remove some pictures."}</span>
          </div>

          {/* One page, top to bottom */}
          <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-6">
            <div className="mx-auto w-full max-w-3xl space-y-8 pb-16">
              <Preview kit={kit} />

              <Section icon={User} title="About" hint="Who the brand is">
                <Rows>
                  <Field icon={Tag} label="Name">
                    <Input id="brand-name" aria-label="Name" value={kit.name} onChange={(e) => edit((k) => ({ ...k, name: e.target.value }))} className="h-9 text-sm font-semibold" />
                  </Field>
                  <Field icon={Sparkles} label="Tagline">
                    <Input id="brand-tag" aria-label="Tagline" value={kit.tagline ?? ""} onChange={(e) => edit((k) => ({ ...k, tagline: e.target.value }))} placeholder="One line that sums it up" className="h-9 text-xs" />
                  </Field>
                  <Field icon={FileText} label="Description" top>
                    <Textarea id="brand-about" aria-label="Description" value={kit.about} onChange={(e) => edit((k) => ({ ...k, about: e.target.value }))} rows={4} placeholder="Who the brand is, who it is for, and how it should feel." className={cn("resize-none text-xs leading-relaxed", TEXT_BOX)} />
                  </Field>
                  <Field icon={Globe} label="Website">
                    <Input id="brand-site" aria-label="Website" value={kit.domain ?? ""} onChange={(e) => edit((k) => ({ ...k, domain: e.target.value }))} placeholder="www.example.com" className="h-9 text-xs" />
                  </Field>
                  <Field icon={Share2} label="Social media" top>
                    <div className="space-y-2">
                      {social.map((s) => (
                        <div key={s.id} className="flex items-center gap-2">
                          <Select value={s.platform} onValueChange={(platform) => edit((k) => ({ ...k, social: (k.social ?? []).map((x) => (x.id === s.id ? { ...x, platform } : x)) }))}>
                            <SelectTrigger aria-label="Platform" className="h-8 w-32 shrink-0 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SOCIAL_PLATFORMS.map((p) => (
                                <SelectItem key={p} value={p} className="text-xs">
                                  {p}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input value={s.url} onChange={(e) => edit((k) => ({ ...k, social: (k.social ?? []).map((x) => (x.id === s.id ? { ...x, url: e.target.value } : x)) }))} placeholder="Link or @handle" aria-label="Link" className="h-8 flex-1 text-xs" />
                          <Button type="button" variant="ghost" size="icon" aria-label="Remove link" onClick={() => edit((k) => ({ ...k, social: (k.social ?? []).filter((x) => x.id !== s.id) }))} className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button type="button" variant="ghost" size="sm" onClick={() => edit((k) => ({ ...k, social: [...(k.social ?? []), { id: `soc-${stamp()}`, platform: "Instagram", url: "" }] }))} className="h-8 gap-1.5 rounded-lg border border-dashed border-border/70 px-3 text-xs text-muted-foreground hover:text-foreground">
                        <Plus className="h-3.5 w-3.5" />
                        Add a link
                      </Button>
                    </div>
                  </Field>
                </Rows>
              </Section>

              <Section icon={ImagePlus} title="Logo" hint="Add as many as you like. Tag each one so you know which is which.">
                <div className="flex flex-wrap items-start gap-3">
                  {kit.logos.map((l) => (
                    <LogoTile key={l.id} logo={l} onTag={(tag) => edit((k) => ({ ...k, logos: k.logos.map((x) => (x.id === l.id ? { ...x, tag } : x)) }))} onRemove={() => edit((k) => ({ ...k, logos: k.logos.filter((x) => x.id !== l.id) }))} />
                  ))}
                  <UploadTile
                    kind="logo"
                    multiple
                    label="Add a logo"
                    className="aspect-square h-auto w-28"
                    onPick={(urls) => edit((k) => ({ ...k, logos: [...k.logos, ...urls.map((url, i) => ({ id: `logo-${stamp()}-${i}`, name: "Logo", url, type: (k.logos.length + i === 0 ? "primary" : "mark") as BrandLogoItem["type"] }))] }))}
                  />
                </div>
              </Section>

              <Section icon={Palette} title="Colors" hint="Click a color to change it. Give one the Background role and one Primary, and the preview follows.">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {kit.colors.map((c) => (
                    <ColorSwatch key={c.id} color={c} onSave={(v) => edit((k) => ({ ...k, colors: k.colors.map((x) => (x.id === c.id ? { ...x, ...v } : x)) }))} onRemove={() => edit((k) => ({ ...k, colors: k.colors.filter((x) => x.id !== c.id) }))} />
                  ))}
                  <ColorSwatch onSave={(v) => edit((k) => ({ ...k, colors: [...k.colors, { id: `col-${stamp()}`, ...v }] }))} />
                </div>
              </Section>

              <Section icon={Type} title="Fonts" hint="Search every Google Font. Each card shows the font as it will look.">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {FONT_SLOTS.map((slot) => (
                    <FontSlot
                      key={slot.role}
                      slot={slot}
                      family={fontOf(kit, slot.role)}
                      onPick={(family) => edit((k) => ({ ...k, typography: [...k.typography.filter((t) => t.role !== slot.role), { id: `font-${stamp()}`, role: slot.role, fontFamily: family }] }))}
                      onClear={() => edit((k) => ({ ...k, typography: k.typography.filter((t) => t.role !== slot.role) }))}
                    />
                  ))}
                </div>
              </Section>

              <Section icon={Package} title="Products" hint="What the brand sells or shows. The pictures are the reference." action={addButton("Add products", () => setBulk(true))}>
                {kit.products.length === 0 ? (
                  <Button type="button" variant="ghost" onClick={() => setBulk(true)} className="flex h-28 w-full flex-col gap-1 rounded-xl border border-dashed border-border bg-secondary/20 text-muted-foreground hover:bg-secondary/50 hover:text-foreground">
                    <Package className="h-5 w-5" />
                    <span className="text-xs">Add your products</span>
                  </Button>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {kit.products.map((p) => (
                      <Button key={p.id} type="button" variant="ghost" onClick={() => setProduct(p)} className="flex h-auto flex-col items-stretch gap-0 overflow-hidden whitespace-normal rounded-xl border border-border/70 bg-card p-0 text-left font-normal hover:bg-card hover:shadow-md">
                        <span className="relative flex aspect-square items-center justify-center bg-secondary/40">
                          {p.images[0] ? <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" /> : <Package className="h-6 w-6 text-muted-foreground/50" />}
                          {p.images.length > 1 && <span className="absolute bottom-1.5 right-1.5 rounded-md bg-background/80 px-1.5 py-0.5 font-mono text-xs text-foreground">{p.images.length}</span>}
                        </span>
                        <span className="block p-2.5">
                          <span className="block truncate text-xs font-semibold text-foreground">{p.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{p.category}</span>
                        </span>
                      </Button>
                    ))}
                  </div>
                )}
              </Section>

              <Section icon={Layers} title="Moodboard" hint="Pictures that show the feeling: lighting, places, wardrobe, textures." action={addButton("New moodboard", () => edit((k) => ({ ...k, visualGroups: [...k.visualGroups, { id: `mood-${stamp()}`, groupTitle: "", images: [] }] })))}>
                {kit.visualGroups.length === 0 && <p className="rounded-xl border border-dashed border-border bg-secondary/20 py-8 text-center text-xs text-muted-foreground">No moodboards yet.</p>}
                <div className="space-y-5">
                  {kit.visualGroups.map((g) => (
                    <div key={g.id} className="group space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={g.groupTitle}
                          onChange={(e) => edit((k) => ({ ...k, visualGroups: k.visualGroups.map((x) => (x.id === g.id ? { ...x, groupTitle: e.target.value } : x)) }))}
                          placeholder="Moodboard name"
                          aria-label="Moodboard name"
                          className="h-8 flex-1 border-transparent bg-transparent px-1 text-xs font-semibold hover:border-border focus-visible:border-select/60"
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" aria-label="Delete moodboard" onClick={() => edit((k) => ({ ...k, visualGroups: k.visualGroups.filter((x) => x.id !== g.id) }))} className="h-7 w-7 p-0 text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete moodboard</TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                        {g.images.map((src, i) => (
                          <div key={i} className="group/img relative aspect-video overflow-hidden rounded-lg border border-border/60">
                            <img src={src} alt="" className="h-full w-full object-cover" />
                            <Button type="button" variant="ghost" size="icon" aria-label="Remove picture" onClick={() => edit((k) => ({ ...k, visualGroups: k.visualGroups.map((x) => (x.id === g.id ? { ...x, images: x.images.filter((_, j) => j !== i) } : x)) }))} className="absolute right-1 top-1 h-5 w-5 rounded-full bg-background/80 p-0 opacity-0 group-hover/img:opacity-100">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        <UploadTile kind="photo" multiple label="Add pictures" className="aspect-video h-auto" onPick={(urls) => edit((k) => ({ ...k, visualGroups: k.visualGroups.map((x) => (x.id === g.id ? { ...x, images: [...x.images, ...urls] } : x)) }))} />
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section icon={LayoutTemplate} title="Template" hint="Starting prompts for this brand, like a social post or a poster." action={addButton("New template", () => setTemplate("new"))}>
                {templates.length === 0 ? (
                  <Button type="button" variant="ghost" onClick={() => setTemplate("new")} className="flex h-24 w-full flex-col gap-1 rounded-xl border border-dashed border-border bg-secondary/20 text-muted-foreground hover:bg-secondary/50 hover:text-foreground">
                    <LayoutTemplate className="h-5 w-5" />
                    <span className="text-xs">Add a template</span>
                  </Button>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {templates.map((t) => (
                      <Button key={t.id} type="button" variant="ghost" onClick={() => setTemplate(t)} className="flex h-auto items-start justify-start gap-3 whitespace-normal rounded-xl border border-border/70 bg-card p-3 text-left font-normal hover:bg-card hover:shadow-md">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center">
                          <RatioShape ratio={t.ratio} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-foreground">
                            {t.name} <span className="font-mono font-normal text-muted-foreground">{t.ratio}</span>
                          </span>
                          <span className="mt-0.5 line-clamp-3 block text-xs leading-relaxed text-muted-foreground">{t.prompt}</span>
                        </span>
                      </Button>
                    ))}
                  </div>
                )}
              </Section>

              <Section icon={ListChecks} title="Rules" hint="Short instructions the agent and your prompts should always follow for this brand.">
                <div className="space-y-1.5">
                  {kit.instructions.map((rule, i) => (
                    <div key={i} className="group flex items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-1.5">
                      <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">{i + 1}</span>
                      <Input value={rule} onChange={(e) => edit((k) => ({ ...k, instructions: k.instructions.map((r, j) => (j === i ? e.target.value : r)) }))} aria-label={`Rule ${i + 1}`} className="h-8 flex-1 border-transparent bg-transparent px-1 text-xs shadow-none" />
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove rule ${i + 1}`} onClick={() => edit((k) => ({ ...k, instructions: k.instructions.filter((_, j) => j !== i) }))} className="h-7 w-7 p-0 text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      addRule(newRule)
                      setNewRule("")
                    }}
                    className="flex items-center gap-2"
                  >
                    <Input value={newRule} onChange={(e) => setNewRule(e.target.value)} placeholder="Add a rule and press Enter" aria-label="New rule" className="h-9 flex-1 text-xs" />
                    <Button type="submit" size="sm" disabled={!newRule.trim()} className="h-9 px-4 text-xs font-semibold">
                      Add
                    </Button>
                  </form>
                </div>
                {ideas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {ideas.map((r) => (
                      <Button key={r} type="button" variant="ghost" size="sm" onClick={() => addRule(r)} className="h-7 gap-1 rounded-full border border-border/60 px-3 text-xs text-muted-foreground hover:text-foreground">
                        <Plus className="h-3 w-3" />
                        {r}
                      </Button>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          </div>
          {col.dock === "bottom" && (
            <div className="mx-auto flex w-full max-w-3xl shrink-0 items-end gap-2 px-4 pb-3 pt-2">
              <div className="min-w-0 flex-1">
                {messages.length > 0 && <div className="mb-1.5 max-h-32 space-y-1.5 overflow-y-auto no-scrollbar">{conversation}</div>}
                {composer}
              </div>
              <DockRightButton onClick={() => col.setDock("right")} />
            </div>
          )}
        </main>

        {col.dock === "right" && col.open && <AgentDivider onStartDrag={() => col.setDragging(true)} onReset={() => col.setWidth(AGENT_WIDTH)} />}
        {col.dock === "right" && (
          <AgentAside open={col.open} width={col.width} onOpen={col.setOpen} onClear={() => setMessages([])} onDockBottom={() => col.setDock("bottom")} feedRef={feed} footer={composer}>
            {conversation}
          </AgentAside>
        )}
      </div>
    </TooltipProvider>
  )
}
