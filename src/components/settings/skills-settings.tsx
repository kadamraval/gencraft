import * as React from "react"
import { limited } from "@/lib/notice"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Download, Pencil, Plus, Sparkles, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { addSkill, removeSkill, setSkillOn, updateSkill, useSkills } from "@/lib/skills/store"
import { LIMITS } from "@/lib/skills/limits"
import { parseSkill, serializeSkill } from "@/lib/skills/skill-file"
import type { SkillView } from "@/lib/skills/store"
import type { SkillScope } from "@/lib/skills/types"

const SCOPES: Array<{ id: SkillScope; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "agent", label: "Agent" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
]

interface Draft {
  id?: string
  name: string
  description: string
  appliesTo: SkillScope[]
  phrase: string
  method: string
}

const EMPTY: Draft = { name: "", description: "", appliesTo: ["image", "video"], phrase: "", method: "" }

function exportSkill(skill: SkillView) {
  const url = URL.createObjectURL(new Blob([serializeSkill(skill)], { type: "text/markdown" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `${skill.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.skill.md`
  a.click()
  URL.revokeObjectURL(url)
}

function Row({ skill, onEdit, onDelete }: { skill: SkillView; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-foreground">{skill.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {skill.description} · {skill.appliesTo.map((s) => SCOPES.find((x) => x.id === s)?.label).join(", ")}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-sm space-y-1.5">
          {skill.phrase && (
            <div>
              <div className="text-xs font-semibold">Added to image, video and audio prompts</div>
              <div className="text-xs">{skill.phrase}</div>
            </div>
          )}
          {skill.method && (
            <div>
              <div className="text-xs font-semibold">Method for chat and agent</div>
              <div className="text-xs">{skill.method}</div>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
      <div className="flex flex-shrink-0 items-center gap-1.5">
        <Button type="button" variant="ghost" size="iconSm" aria-label={`Export ${skill.name}`} onClick={() => exportSkill(skill)} className="h-7 w-7">
          <Download className="h-3.5 w-3.5" />
        </Button>
        {onEdit && (
          <Button type="button" variant="ghost" size="iconSm" aria-label={`Edit ${skill.name}`} onClick={onEdit} className="h-7 w-7">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {onDelete && (
          <Button type="button" variant="ghost" size="iconSm" aria-label={`Delete ${skill.name}`} onClick={onDelete} className="h-7 w-7 hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
        <Switch checked={skill.on} onCheckedChange={(on) => setSkillOn(skill.id, on)} aria-label={`Use ${skill.name}`} />
      </div>
    </div>
  )
}

/**
 * Skills: ready-made ones to switch on or off, and the user's own. Type / in the composer to use one.
 * In Image, Video and Audio a skill adds its phrase after your words; in Chat and Agent it gives the model a method.
 */
export function SkillsSettings() {
  const { presets, mine } = useSkills()
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [doomed, setDoomed] = React.useState<SkillView | null>(null)
  const [importError, setImportError] = React.useState("")
  const fileInput = React.useRef<HTMLInputElement>(null)

  const valid = draft && draft.name.trim() && draft.appliesTo.length > 0 && (draft.phrase.trim() || draft.method.trim())

  const importFile = async (file: File) => {
    setImportError("")
    const parsed = parseSkill(await file.text())
    if ("error" in parsed) return setImportError(parsed.error)
    if (parsed.description.length > LIMITS.description || parsed.phrase.length > LIMITS.phrase || parsed.method.length > LIMITS.method) {
      return setImportError(`Too long. Description up to ${LIMITS.description} characters, prompt phrase ${LIMITS.phrase}, method ${LIMITS.method}.`)
    }
    limited(() => addSkill(parsed))
  }

  const save = () => {
    if (!draft || !valid) return
    const { id, ...fields } = draft
    if (id) updateSkill(id, fields)
    else if (limited(() => addSkill(fields)) === undefined) return
    setDraft(null)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-in fade-in duration-150">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Skills</div>
          <p className="mt-0.5 text-xs text-muted-foreground">A saved way of working. Type / in the composer to use one.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => fileInput.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
          <Input
            ref={fileInput}
            type="file"
            accept=".md,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ""
              if (f) void importFile(f)
            }}
          />
          <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setDraft({ ...EMPTY })}>
            <Plus className="h-3.5 w-3.5" />
            Add skill
          </Button>
        </div>
      </div>
      {importError && <p className="text-xs text-destructive">{importError}</p>}

      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-foreground">Yours</div>
        {mine.length === 0 ? (
          <EmptyState icon={Sparkles} title="You have not made a skill yet" hint="Add one for a look or a method you use often, such as your brand's photo style or how you want scripts written." />
        ) : (
          mine.map((s) => (
            <Row
              key={s.id}
              skill={s}
              onEdit={() => setDraft({ id: s.id, name: s.name, description: s.description, appliesTo: s.appliesTo, phrase: s.phrase, method: s.method })}
              onDelete={() => setDoomed(s)}
            />
          ))
        )}
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-foreground">Ready-made</div>
        {presets.map((s) => (
          <Row key={s.id} skill={s} />
        ))}
      </div>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit skill" : "New skill"}</DialogTitle>
            <DialogDescription>Fill in what applies. At least one of the two boxes is needed.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" className="h-8 text-xs" />
              <Input value={draft.description} maxLength={LIMITS.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="One line saying when to use it" className="h-8 text-xs" />
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-muted-foreground">Works in</span>
                {SCOPES.map((s) => (
                  <label key={s.id} className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={draft.appliesTo.includes(s.id)}
                      onCheckedChange={(on) => setDraft({ ...draft, appliesTo: on ? [...draft.appliesTo, s.id] : draft.appliesTo.filter((x) => x !== s.id) })}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-foreground">
                  <span>Added to image, video and audio prompts</span>
                  <span className="font-mono text-muted-foreground">{draft.phrase.length}/{LIMITS.phrase}</span>
                </div>
                <Textarea maxLength={LIMITS.phrase} value={draft.phrase} onChange={(e) => setDraft({ ...draft, phrase: e.target.value })} placeholder="e.g. soft window light, muted earthy palette, 50mm lens, film grain" className="min-h-16 rounded-lg border border-border/60" />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-foreground">
                  <span>Method for chat and agent</span>
                  <span className="font-mono text-muted-foreground">{draft.method.length}/{LIMITS.method}</span>
                </div>
                <Textarea maxLength={LIMITS.method} value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })} placeholder="e.g. Write scripts in short scenes. Always name the location and the light first." className="min-h-16 rounded-lg border border-border/60" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={!valid} onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={doomed !== null}
        title={`Delete "${doomed?.name}"?`}
        description="It is removed from this device and cannot be recovered."
        onCancel={() => setDoomed(null)}
        onConfirm={() => {
          if (doomed) removeSkill(doomed.id)
          setDoomed(null)
        }}
      />
    </div>
  )
}
