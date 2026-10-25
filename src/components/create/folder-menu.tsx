import * as React from "react"
import { limited } from "@/lib/notice"
import { Check, ChevronDown, Folder, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DEFAULT_FOLDER_ID, createFolder, useFolders } from "@/lib/library/folders-store"

interface Props {
  selectedId: string
  onSelect: (id: string) => void
  /** How many items each folder holds, for this page's kind of file */
  countOf: (id: string) => number
}

/**
 * The folder choice on the Image, Video and Audio pages: a small button showing the current folder (Default to
 * begin with). It opens a list you can search, with a way to make a new folder.
 */
export function FolderMenu({ selectedId, onSelect, countOf }: Props) {
  const { folders } = useFolders()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [name, setName] = React.useState("")
  const all = [{ id: DEFAULT_FOLDER_ID, title: "Default" }, ...folders]
  const current = all.find((f) => f.id === selectedId) ?? all[0]!
  const shown = all.filter((f) => f.title.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 rounded-lg border border-border/60 bg-secondary/40 px-2.5 text-xs font-medium">
          <Folder className="h-3.5 w-3.5 text-muted-foreground" />
          {current.title}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search folders" className="h-8 pl-8 text-xs" />
        </div>
        <div className="max-h-56 space-y-0.5 overflow-y-auto no-scrollbar">
          {shown.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No folder matches.</p>}
          {shown.map((f) => (
            <Button
              key={f.id}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onSelect(f.id)
                setOpen(false)
              }}
              className="h-8 w-full justify-between px-2 text-xs"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Folder className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="truncate">{f.title}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-mono text-muted-foreground">{countOf(f.id)}</span>
                {f.id === current.id && <Check className="h-3 w-3" />}
              </span>
            </Button>
          ))}
        </div>
        <form
          className="flex items-center gap-1.5 border-t border-border/50 pt-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            const made = limited(() => createFolder(name))
            if (!made) return
            onSelect(made.id)
            setName("")
            setOpen(false)
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New folder" className="h-8 text-xs" />
          <Button type="submit" size="iconSm" variant="secondary" aria-label="Create folder" disabled={!name.trim()} className="h-8 w-8 p-0">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
