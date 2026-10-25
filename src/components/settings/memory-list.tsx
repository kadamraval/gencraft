import * as React from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import type { SettingsState } from "@/types"
import { Line } from "./voice-limits"
import { Input } from "@/components/ui/input"
import { addMemory, clearMemory, removeMemory, updateMemory, useMemory } from "@/lib/brain/memory"

/** What the assistant remembers: shown in full, each one editable and removable. Sent with every chat and agent run. */
export function MemoryList() {
  const memories = useMemory()
  const [draft, setDraft] = React.useState("")
  const [note, setNote] = React.useState("")
  const add = () => {
    const r = addMemory(draft)
    if (r.ok) {
      setDraft("")
      setNote("")
    } else setNote(r.reason)
  }
  return (
    <div className="space-y-3 rounded-xl border border-border bg-secondary p-4">
      <div className="flex items-start justify-between gap-3 text-xs">
        <div>
          <div className="font-bold text-foreground">What the assistant remembers</div>
          <div className="text-muted-foreground">Short facts it keeps on this device and uses in every chat and agent run. Tell it "remember that..." in chat, or add one here. Keys and passwords are never saved.</div>
        </div>
        {memories.length > 0 && (
          <Button type="button" variant="ghost" size="sm" className="h-7 flex-shrink-0 text-xs hover:text-destructive" onClick={clearMemory}>
            Clear all
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="For example: My brand is Blue Peach, we sell women's innerwear in India" className="h-8 text-xs" aria-label="Add a memory" />
        <Button type="button" size="sm" variant="secondary" className="h-8 gap-1 text-xs" onClick={add} disabled={!draft.trim()}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      {note && <p className="text-xs text-destructive">{note}</p>}
      {memories.length > 0 && (
        <div className="space-y-1.5">
          {memories.map((m) => (
            <div key={m.id} className="flex items-center gap-1.5">
              <Input defaultValue={m.text} onBlur={(e) => e.target.value.trim() !== m.text && updateMemory(m.id, e.target.value)} className="h-7 text-xs" aria-label="Memory" />
              <Button type="button" variant="ghost" size="iconSm" aria-label="Forget this" className="h-6 w-6 flex-shrink-0 p-0 hover:text-destructive" onClick={() => removeMemory(m.id)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


/** The Memory tab: the switch, then everything that is remembered */
export function MemoryPage({ settings, onChange }: { settings: SettingsState; onChange: (settings: SettingsState) => void }) {
  const on = settings.aiEngine.memoryEnabled !== false
  return (
    <div className="space-y-2">
      <Line title="Remember things from chats" hint="Chat and the agent save lasting facts you tell them and use them next time. You can see, edit and delete everything below.">
        <Switch checked={on} onCheckedChange={(v) => onChange({ ...settings, aiEngine: { ...settings.aiEngine, memoryEnabled: v } })} aria-label="Remember things from chats" />
      </Line>
      {!on && <p className="px-1 text-xs text-muted-foreground">Memory is off. Nothing new is saved and what is below is not used. It is kept until you delete it.</p>}
      <MemoryList />
    </div>
  )
}
