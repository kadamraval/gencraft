import * as React from "react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Check, History, MessageSquare, Pencil, Plus, Search, Trash2, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { removeConversations, renameConversation, useConversations } from "@/lib/chat/history-store"
import { cn } from "@/lib/utils"

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

export interface HistoryProps {
  activeId: string
  /** Which conversations to list: chat or agent */
  kind: "chat" | "agent"
  onOpen: (id: string) => void
  onNew: () => void
  onDeleted: (ids: string[]) => void
  /** A reply is running: switching now would mix its result into another chat */
  busy?: boolean
}

/** The small icon in the composer's top right cluster */
export function HistoryButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          aria-label="History"
          aria-pressed={open}
          onClick={onToggle}
          className="h-6 w-6 rounded-md p-0 text-muted-foreground hover:text-foreground"
        >
          <History className="h-3 w-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>History</TooltipContent>
    </Tooltip>
  )
}

/** The list of past conversations. It sits behind the composer, as wide as it, and slides up out of it. */
export function HistoryList({ activeId, kind, onOpen, onNew, onDeleted, busy, onClose }: HistoryProps & { onClose: () => void }) {
  const all = useConversations()
  const [query, setQuery] = React.useState("")
  const [renaming, setRenaming] = React.useState<{ id: string; title: string } | null>(null)
  const [confirm, setConfirm] = React.useState<string | null>(null)
  const rows = all.filter((r) => r.kind === kind && r.title.toLowerCase().includes(query.trim().toLowerCase()))
  const doomed = all.find((r) => r.id === confirm)
  const Icon = kind === "agent" ? Wand2 : MessageSquare

  return (
    <>
      <div className="space-y-2 rounded-t-2xl border border-b-0 border-border bg-popover p-2 pb-4 text-popover-foreground shadow-xl duration-200 animate-in fade-in slide-in-from-bottom-full">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="h-8 pl-8 text-xs" />
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            className="h-8 gap-1 text-xs"
            onClick={() => {
              onNew()
              onClose()
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
        {busy && <p className="px-1 text-xs text-muted-foreground">A reply is running. Switch when it finishes.</p>}
        <div className="max-h-72 space-y-0.5 overflow-y-auto no-scrollbar">
          {rows.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{all.length === 0 ? "Your chats are saved here." : "Nothing matches."}</p>}
          {rows.map((r) => (
            <div key={r.id} className={cn("group flex items-center gap-2 rounded-lg px-2 py-1.5", r.id === activeId ? "bg-secondary" : "hover:bg-secondary/60")}>
              <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              {renaming?.id === r.id ? (
                <Input
                  autoFocus
                  value={renaming.title}
                  onChange={(e) => setRenaming({ id: r.id, title: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void renameConversation(r.id, renaming.title)
                      setRenaming(null)
                    }
                    if (e.key === "Escape") setRenaming(null)
                  }}
                  className="h-7 flex-1 text-xs"
                  aria-label="Name"
                />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    onOpen(r.id)
                    onClose()
                  }}
                  className="h-auto min-w-0 flex-1 flex-col items-start gap-0 p-0 text-left hover:bg-transparent"
                >
                  <span className="w-full truncate text-xs font-medium text-foreground">{r.title}</span>
                  <span className="text-xs text-muted-foreground">{ago(r.updatedAt)}</span>
                </Button>
              )}
              <span className="flex flex-shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                {renaming?.id === r.id ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="iconSm"
                    aria-label="Save name"
                    onClick={() => {
                      void renameConversation(r.id, renaming.title)
                      setRenaming(null)
                    }}
                    className="h-6 w-6 p-0"
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="ghost" size="iconSm" aria-label="Rename" onClick={() => setRenaming({ id: r.id, title: r.title })} className="h-6 w-6 p-0">
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button type="button" variant="ghost" size="iconSm" aria-label="Delete" onClick={() => setConfirm(r.id)} className="h-6 w-6 p-0 hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={`Delete this ${kind === "agent" ? "agent run" : "chat"}?`}
        description={`"${doomed?.title}" is removed from this device and cannot be recovered. Images, videos and audio it made stay in your Library.`}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) {
            void removeConversations([confirm])
            onDeleted([confirm])
          }
          setConfirm(null)
        }}
      />
    </>
  )
}
