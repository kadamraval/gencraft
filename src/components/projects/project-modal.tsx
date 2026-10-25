import * as React from "react"
import {
  FolderKanban,
  Folder,
  Plus,
  ArrowRight,
} from "lucide-react"
import { Project, GenerationMode } from "@/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface ProjectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
  activeProject?: Project
  onSelectProject: (project: Project) => void
  onCreateProject: (params: {
    title: string
    description: string
    defaultMode: GenerationMode
    aspectRatio: string
  }) => void
}

export function ProjectModal({
  open,
  onOpenChange,
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
}: ProjectModalProps) {
  const [isCreating, setIsCreating] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState("")

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    onCreateProject({
      title: newTitle.trim(),
      description: "",
      defaultMode: "video",
      aspectRatio: "16:9",
    })
    setNewTitle("")
    setIsCreating(false)
  }

  const handleCancel = () => {
    setNewTitle("")
    setIsCreating(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg w-full h-96 p-0 flex flex-col overflow-hidden rounded-2xl bg-card text-card-foreground border border-border shadow-none select-none">
        {/* HEADER: Left icon and Project title ONLY - NO DESCRIPTION. pr-14 prevents collision with dialog close X */}
        <DialogHeader className="h-12 px-5 border-b border-border flex flex-row items-center justify-between shrink-0 pr-14 space-y-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-foreground border border-border/60">
              <FolderKanban className="h-4 w-4" />
            </div>
            <DialogTitle className="text-sm font-semibold text-foreground tracking-tight">
              Projects
            </DialogTitle>
          </div>

          <Button
            type="button"
            variant={isCreating ? "secondary" : "default"}
            size="sm"
            onClick={() => {
              if (isCreating) {
                handleCancel()
              } else {
                setIsCreating(true)
              }
            }}
            className="h-7 px-2.5 text-xs gap-1"
          >
            {isCreating ? (
              <span>Cancel</span>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                <span>New Project</span>
              </>
            )}
          </Button>
        </DialogHeader>

        {/* BODY: Fixed height scrollable area */}
        <div className="flex-1 p-4 overflow-y-auto min-h-0">
          {/* COLLAPSING NEW PROJECT FORM */}
          {isCreating ? (
            <form onSubmit={handleCreate} className="h-full flex flex-col justify-center max-w-sm mx-auto space-y-4 animate-fade-in">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Project Name
                </label>
                <Input
                  type="text"
                  placeholder="Enter project name..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="h-9 text-xs bg-secondary/50 border-border text-foreground"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleCancel}
                  className="h-8 text-xs px-3"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!newTitle.trim()}
                  variant="default"
                  size="sm"
                  className="h-8 text-xs px-3 gap-1"
                >
                  <span>Create Project</span>
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </form>
          ) : (
            /* GRID WISE SMALL: FOLDER ABOVE, NAME BELOW */
            <div className="grid grid-cols-3 gap-2.5">
              {projects.map((proj) => {
                const isSelected = activeProject?.id === proj.id

                return (
                  <Button
                    key={proj.id}
                    type="button"
                    variant="ghost"
                    onClick={() => onSelectProject(proj)}
                    className={`group relative flex flex-col items-center justify-center gap-2 p-3 rounded-xl border text-center transition-all cursor-pointer h-24 whitespace-normal ${
                      isSelected
                        ? "bg-secondary text-foreground border-select/50 font-medium"
                        : "bg-card border-border hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
                    }`}
                    title={proj.title}
                  >
                    {/* Active dot in top right */}
                    {isSelected && (
                      <span
                        className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-emerald-400"
                        title="Active"
                      />
                    )}

                    {/* Folder ABOVE */}
                    <Folder
                      className={`h-5 w-5 shrink-0 transition-colors ${
                        isSelected
                          ? "text-foreground"
                          : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    />

                    {/* Name BELOW */}
                    <span className="text-xs truncate w-full px-1 font-medium text-center">
                      {proj.title}
                    </span>
                  </Button>
                )
              })}

              {/* Inline Add Card */}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsCreating(true)}
                className="group flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-border/80 hover:border-border hover:bg-secondary/40 text-muted-foreground hover:text-foreground transition-all cursor-pointer h-24 whitespace-normal"
                title="Create New Project"
              >
                <Plus className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                <span className="text-xs font-medium text-center truncate w-full">
                  New Project
                </span>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
