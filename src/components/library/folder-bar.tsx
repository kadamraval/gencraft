import * as React from "react"
import { FolderPlus, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export interface FolderCard {
  id: string
  title: string
  count: number
  /** Up to four thumbnails shown in the 2 by 2 preview */
  previews: string[]
  /** User folders can be deleted; Default cannot */
  removable: boolean
}

interface Props {
  folders: FolderCard[]
  selectedId: string
  onSelect: (id: string) => void
  onCreate: (title: string) => void
  onDelete: (id: string) => void
}

/**
 * The folder row at the bottom of the Library: a New button, then one small card per folder with a 2 by 2
 * preview. Default is always first, even when empty. Clicking a selected folder goes back to Default.
 */
export function FolderBar({ folders, selectedId, onSelect, onCreate, onDelete }: Props) {
  const [isAddOpen, setIsAddOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [confirm, setConfirm] = React.useState<FolderCard | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onCreate(title)
    setTitle("")
    setIsAddOpen(false)
  }

  return (
    <div className="shrink-0 h-24 px-8 py-2 bg-transparent border-0 flex items-center gap-3 overflow-x-auto select-none z-30">
      {/* Create Folder button on bottom-left: Compact square */}
      <div className="shrink-0 relative">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setIsAddOpen(!isAddOpen)}
          className="group flex flex-col items-center justify-center gap-1 h-20 w-20 rounded-xl bg-secondary/30 border border-dashed border-border/70 hover:bg-secondary/60 transition-all duration-200 active:scale-95 text-muted-foreground hover:text-foreground cursor-pointer shrink-0 p-0"
          title="Create New Folder"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-card border border-border shadow-xs group-hover:scale-110 transition-transform">
            <Plus className={`h-3.5 w-3.5 transition-transform duration-300 ease-out ${isAddOpen ? "rotate-45 text-foreground" : "group-hover:rotate-90"}`} />
          </div>
          <span className="text-xs font-medium tracking-tight">New</span>
        </Button>

        {isAddOpen && (
          <div className="absolute bottom-full left-0 mb-2 w-60 rounded-xl bg-card border border-border p-3 shadow-2xl animate-fade-in space-y-2 z-40">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FolderPlus className="h-3.5 w-3.5" />
              <span>New Folder</span>
            </div>
            <form onSubmit={submit} className="space-y-2">
              <Input
                type="text"
                placeholder="Folder name..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-7 px-2 text-xs rounded-lg bg-secondary border border-border text-foreground"
                autoFocus
              />
              <div className="flex justify-end gap-1.5 pt-0.5">
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddOpen(false)} className="h-6 px-2 text-xs text-muted-foreground hover:bg-secondary transition-colors cursor-pointer">
                  Cancel
                </Button>
                <Button type="submit" variant="default" size="sm" disabled={!title.trim()} className="h-6 px-2.5 text-xs font-medium disabled:opacity-50 transition-opacity cursor-pointer">
                  Create
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>

      {folders.map((folder) => {
        const isSelected = selectedId === folder.id
        return (
          <div
            key={folder.id}
            onClick={() => onSelect(isSelected ? folders[0]!.id : folder.id)}
            className={`group relative shrink-0 h-20 w-20 rounded-xl bg-card border p-1 cursor-pointer transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-lg flex flex-col justify-between ${
              isSelected ? "border-select/60 bg-select/10 ring-1 ring-select/20 shadow-md" : "border-border"
            }`}
            title={folder.title}
          >
            <div className="grid grid-cols-2 grid-rows-2 gap-0.5 w-full flex-1 rounded-lg overflow-hidden bg-secondary/40">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="relative w-full h-full overflow-hidden bg-secondary/60">
                  {folder.previews[i] && <img src={folder.previews[i]} alt="preview" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />}
                </div>
              ))}
            </div>
            <div className="pt-1 px-0.5 flex items-center justify-between text-xs font-medium text-foreground truncate">
              <span className="truncate">{folder.title}</span>
              <span className="text-xs text-muted-foreground font-mono ml-1 shrink-0">{folder.count}</span>
            </div>
            {folder.removable && (
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                aria-label={`Delete folder ${folder.title}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirm(folder)
                }}
                className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full border border-border bg-card p-0 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )
      })}

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete the folder "{confirm?.title}"?</DialogTitle>
            <DialogDescription>Only the folder is removed. Its {confirm?.count ?? 0} item{confirm?.count === 1 ? "" : "s"} stay in Default.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="text-destructive"
              onClick={() => {
                if (confirm) onDelete(confirm.id)
                setConfirm(null)
              }}
            >
              Delete folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
