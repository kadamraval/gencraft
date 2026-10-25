import * as React from "react"
import { Check, ChevronDown, Search, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { FONT_KINDS, GOOGLE_FONTS, ensureFont, face, loadFonts, type FontKind } from "@/lib/brand/fonts"
import { cn } from "@/lib/utils"

/**
 * Chooses a Google Fonts family. The whole list (about 1,950 families) is built in, so searching needs no network. Only the rows on screen
 * ask Google for their font, and each row is written in its own face. Recent and starred families are kept on this device.
 */

const ROW = 36
const VIEW = 288
const RECENT_KEY = "gencraft_fonts_recent"
const STAR_KEY = "gencraft_fonts_starred"

const read = (key: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}
const write = (key: string, value: string[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // only a convenience
  }
}

export function FontPicker({ value, onChange }: { value: string; onChange: (family: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [kind, setKind] = React.useState<FontKind | "all" | "starred">("all")
  const [top, setTop] = React.useState(0)
  const [recent, setRecent] = React.useState(() => read(RECENT_KEY))
  const [starred, setStarred] = React.useState(() => read(STAR_KEY))
  const box = React.useRef<HTMLDivElement>(null)

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return GOOGLE_FONTS.filter(([name, k]) => (kind === "all" || (kind === "starred" ? starred.includes(name) : k === kind)) && (!q || name.toLowerCase().includes(q)))
  }, [query, kind, starred])

  const first = Math.max(0, Math.floor(top / ROW) - 4)
  const last = Math.min(rows.length, first + Math.ceil(VIEW / ROW) + 9)
  const visible = rows.slice(first, last)
  const visibleKey = visible.map(([n]) => n).join("|")
  React.useEffect(() => {
    if (open) loadFonts(visible.map(([n]) => n).concat(recent.slice(0, 6)))
  }, [open, visibleKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (family: string) => {
    const next = [family, ...recent.filter((r) => r !== family)].slice(0, 8)
    setRecent(next)
    write(RECENT_KEY, next)
    void ensureFont(family, 400)
    onChange(family)
    setOpen(false)
  }
  const star = (family: string) => {
    const next = starred.includes(family) ? starred.filter((s) => s !== family) : [...starred, family]
    setStarred(next)
    write(STAR_KEY, next)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) loadFonts([value, ...recent.slice(0, 6)])
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="secondary" aria-label="Font" className="h-8 w-full justify-between gap-2 px-2 text-xs font-normal">
          <span className="truncate text-sm" style={face(value)}>
            {value || "System sans"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-2 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setTop(0)
              if (box.current) box.current.scrollTop = 0
            }}
            placeholder={`Search ${GOOGLE_FONTS.length} fonts`}
            aria-label="Search fonts"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {[...FONT_KINDS, { id: "starred" as const, label: "Starred" }].map((k) => (
            <Button key={k.id} type="button" variant="ghost" size="sm" aria-pressed={kind === k.id} onClick={() => { setKind(k.id); setTop(0); if (box.current) box.current.scrollTop = 0 }} className={cn("h-6 px-2 text-xs", kind === k.id ? "bg-secondary text-foreground" : "text-muted-foreground")}>
              {k.label}
            </Button>
          ))}
        </div>
        {recent.length > 0 && query === "" && kind === "all" && (
          <div className="flex flex-wrap gap-1">
            {recent.slice(0, 6).map((r) => (
              <Button key={r} type="button" variant="outline" size="sm" onClick={() => choose(r)} className="h-6 max-w-[8.5rem] px-2 text-xs font-normal">
                <span className="truncate" style={face(r)}>
                  {r}
                </span>
              </Button>
            ))}
          </div>
        )}
        <div ref={box} onScroll={(e) => setTop(e.currentTarget.scrollTop)} className="overflow-y-auto rounded-md border border-border/60" style={{ height: `${VIEW}px` }} role="listbox" aria-label="Fonts">
          <div className="relative" style={{ height: `${rows.length * ROW}px` }}>
            {visible.map(([name, k], i) => (
              <div key={name} role="option" aria-selected={name === value} className="absolute inset-x-0 flex items-center gap-1 px-2 hover:bg-secondary" style={{ top: `${(first + i) * ROW}px`, height: `${ROW}px` }}>
                <Button type="button" variant="ghost" onClick={() => choose(name)} className="h-full min-w-0 flex-1 justify-start gap-2 rounded-none px-0 text-base font-normal hover:bg-transparent">
                  {name === value ? <Check className="h-3.5 w-3.5 flex-shrink-0" /> : <span className="w-3.5 flex-shrink-0" />}
                  <span className="truncate" style={face(name)}>
                    {name}
                  </span>
                </Button>
                <span className="flex-shrink-0 text-xs text-muted-foreground">{k}</span>
                <Button type="button" variant="ghost" size="icon" aria-label={starred.includes(name) ? `Unstar ${name}` : `Star ${name}`} onClick={() => star(name)} className="h-6 w-6 flex-shrink-0">
                  <Star className={cn("h-3.5 w-3.5", starred.includes(name) ? "fill-current text-foreground" : "text-muted-foreground")} />
                </Button>
              </div>
            ))}
            {rows.length === 0 && <p className="p-3 text-xs text-muted-foreground">No font matches that.</p>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Fonts come from Google Fonts and need a connection the first time you use one.</p>
      </PopoverContent>
    </Popover>
  )
}
