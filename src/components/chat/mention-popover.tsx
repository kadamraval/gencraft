import * as React from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { KIND_STYLE, kindOf } from "@/components/elements/kind-colors"

export interface MentionReferenceItem {
  id: string
  name: string
  imageUrl: string
  /** Label shown in the list, e.g. "Character" */
  category?: string
  /** Colour group: an element category, or "reference" for an attached image */
  kind?: string
}

interface MentionPopoverProps {
  isOpen: boolean
  searchQuery: string
  items: MentionReferenceItem[]
  onSelect: (item: MentionReferenceItem) => void
  onClose?: () => void
}

export function MentionPopover({
  isOpen,
  searchQuery,
  items,
  onSelect,
  onClose,
}: MentionPopoverProps) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const [internalQuery, setInternalQuery] = React.useState(searchQuery)
  const [selectedIndex, setSelectedIndex] = React.useState(0)

  // Sync internalQuery when searchQuery prop changes
  React.useEffect(() => {
    setInternalQuery(searchQuery)
  }, [searchQuery])

  // Filter items based on active query
  const effectiveQuery = (internalQuery || searchQuery).trim().toLowerCase()
  const filteredItems = React.useMemo(() => {
    if (!effectiveQuery) return items
    return items.filter((item) => item.name.toLowerCase().includes(effectiveQuery))
  }, [items, effectiveQuery])

  React.useEffect(() => {
    setSelectedIndex(0)
  }, [effectiveQuery])

  // Up and Down move through the list, Enter chooses, Escape closes. Captured before the prompt box sees the
  // key, so Enter picks the highlighted item instead of sending the message.
  React.useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (filteredItems.length === 0) return
        e.preventDefault()
        e.stopPropagation()
        setSelectedIndex((i) => (e.key === "ArrowDown" ? (i + 1) % filteredItems.length : (i - 1 + filteredItems.length) % filteredItems.length))
      } else if ((e.key === "Enter" || e.key === "Tab") && filteredItems[selectedIndex]) {
        e.preventDefault()
        e.stopPropagation()
        onSelect(filteredItems[selectedIndex]!)
      } else if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        onClose?.()
      }
    }
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [isOpen, filteredItems, selectedIndex, onSelect, onClose])

  // Keep the highlighted row in view while moving through a long list
  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`)?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  if (!isOpen) return null

  return (
    <div className="absolute bottom-full left-4 mb-2 w-72 rounded-2xl bg-popover/95 backdrop-blur-xl text-popover-foreground border border-border shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 max-h-80 flex flex-col">
      {/* SEARCH INPUT BAR */}
      <div className="p-1.5 border-b border-border/40 flex items-center gap-1.5 bg-secondary/30 rounded-xl mb-1 flex-shrink-0">
        <Search className="h-3.5 w-3.5 text-muted-foreground ml-1 flex-shrink-0" />
        <Input
          type="text"
          placeholder="Search references..."
          value={internalQuery}
          onChange={(e) => setInternalQuery(e.target.value)}
          className="w-full bg-transparent border-0 shadow-none text-xs text-foreground placeholder:text-muted-foreground/60 h-7 px-1 focus-visible:bg-transparent focus-visible:border-transparent focus-visible:ring-0"
        />
        {internalQuery && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setInternalQuery("")}
            className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </Button>
        )}
      </div>

      {/* ITEMS LIST */}
      <div ref={listRef} className="space-y-0.5 overflow-y-auto no-scrollbar flex-1 max-h-60">
        {filteredItems.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            No references found.
          </div>
        ) : (
          filteredItems.map((item, index) => {
            const isSelected = index === selectedIndex

            return (
              <Button
                key={item.id}
                data-index={index}
                type="button"
                variant="ghost"
                onClick={() => onSelect(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`w-full justify-start h-auto flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-colors ${
                  isSelected
                    ? "bg-secondary text-foreground font-medium"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                {/* A small round picture, then the name */}
                <img
                  src={item.imageUrl}
                  alt=""
                  className="h-6 w-6 rounded-full object-cover border border-border/50 flex-shrink-0"
                />
                <span className="text-xs font-medium text-foreground truncate">
                  {item.name}
                </span>
                <span className="ml-auto flex flex-shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${KIND_STYLE[kindOf(item.kind)].dot}`} />
                  {item.category ?? "Image"}
                </span>
              </Button>
            )
          })
        )}
      </div>
    </div>
  )
}
