import * as React from "react"
import { CircleHelp, Download, FolderOpen, Loader2, RotateCcw, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BACKUP_EXTENSION, restoreBackup } from "@/lib/backup/backup"
import { LEGACY_BACKUP_EXTENSION } from "@/lib/legacy-names"
import { canChooseFolder, chooseFolder, forgetFolder, shownFolder } from "@/lib/backup/folder"
import { runBackup, setBackupState, useBackupState } from "@/lib/backup/service"
import type { BackupDestination, BackupSchedule } from "@/lib/backup/service"
import { isConnected } from "@/lib/integrations/composio"
import type { SettingsState } from "@/types"
import { Line } from "./voice-limits"

const ago = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

/** Where files are saved, backups, and how often they run. */
export function BackupSettings({ settings }: { settings: SettingsState }) {
  const state = useBackupState()
  const [folder, setFolder] = React.useState<Awaited<ReturnType<typeof shownFolder>> | null>(null)
  const [pending, setPending] = React.useState<File | null>(null)
  const [restoring, setRestoring] = React.useState(false)
  const [restoreNote, setRestoreNote] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const key = settings.aiEngine.composioApiKey ?? ""
  const driveOn = isConnected("googledrive")
  const dropboxOn = isConnected("dropbox")

  React.useEffect(() => {
    void shownFolder().then(setFolder)
  }, [])

  const choose = async () => {
    if (await chooseFolder()) setFolder(await shownFolder())
  }

  const reset = async () => {
    await forgetFolder()
    setFolder(await shownFolder())
  }

  const restore = async () => {
    if (!pending) return
    const file = pending
    setPending(null)
    setRestoring(true)
    setRestoreNote(null)
    try {
      const r = await restoreBackup(file)
      setRestoreNote(`Restored ${r.uploads} files, ${r.results} results, ${r.elements} elements and ${r.chats} chats. Reloading.`)
      window.setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      setRestoreNote(e instanceof Error ? e.message : String(e))
    } finally {
      setRestoring(false)
    }
  }

  const status = state.lastError ? `Failed: ${state.lastError}` : state.lastAt ? `Last backup ${ago(state.lastAt)} · ${state.lastName}` : "No backup yet"

  return (
    <div className="space-y-2">
      <Line title={folder?.isDefault ? "Save folder (default)" : "Save folder"} hint={folder ? `${folder.label}${canChooseFolder() ? "" : " · changing it needs the desktop app"}` : ""}>
        <Button type="button" variant="secondary" size="sm" className="h-8 gap-1.5 text-xs" disabled={!canChooseFolder()} onClick={() => void choose()}>
          <FolderOpen className="h-3.5 w-3.5" />
          Change
        </Button>
        {folder && !folder.isDefault && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="iconSm" aria-label="Back to the default folder" onClick={() => void reset()}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to the default folder</TooltipContent>
          </Tooltip>
        )}
      </Line>

      <Line title="Copy new results to the folder" hint={folder?.writable === false ? "Change the folder first. A browser cannot write to Downloads on its own" : "A folder for each project, and your Library folders inside it"}>
        <Switch checked={state.saveResults && folder?.writable === true} disabled={folder?.writable !== true} onCheckedChange={(v) => setBackupState({ saveResults: v })} aria-label="Copy new results to the folder" />
      </Line>

      <Line title="Back up to">
        <Select value={state.destination} onValueChange={(v) => setBackupState({ destination: v as BackupDestination })}>
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="folder" className="text-xs">
              Save folder{folder?.writable === false ? " (a download)" : ""}
            </SelectItem>
            <SelectItem value="googledrive" disabled={!driveOn} className="text-xs">
              Google Drive{driveOn ? "" : " (connect it first)"}
            </SelectItem>
            <SelectItem value="dropbox" disabled={!dropboxOn} className="text-xs">
              Dropbox{dropboxOn ? "" : " (connect it first)"}
            </SelectItem>
          </SelectContent>
        </Select>
      </Line>

      <Line title="Back up automatically" hint="Runs while the app is open">
        <Select value={state.schedule} onValueChange={(v) => setBackupState({ schedule: v as BackupSchedule })}>
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off" className="text-xs">
              Off
            </SelectItem>
            <SelectItem value="daily" className="text-xs">
              Every day
            </SelectItem>
            <SelectItem value="weekly" className="text-xs">
              Every week
            </SelectItem>
          </SelectContent>
        </Select>
      </Line>

      <Line title="Back up now" hint={status}>
        <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" disabled={state.running} onClick={() => void runBackup(key)}>
          {state.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Back up
        </Button>
        <Button type="button" variant="secondary" size="sm" className="h-8 gap-1.5 text-xs" disabled={restoring} onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />
          Restore
        </Button>
        <Input
          ref={fileRef}
          type="file"
          className="hidden"
          accept={`.${BACKUP_EXTENSION},.${LEGACY_BACKUP_EXTENSION},.zip`}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null
            e.target.value = ""
            if (file) setPending(file)
          }}
        />
      </Line>
      {restoreNote && <p className="px-1 text-xs text-muted-foreground">{restoreNote}</p>}

      <ConfirmDialog
        open={pending !== null}
        neutral={{ icon: CircleHelp }}
        confirmLabel="Restore"
        title="Restore this backup?"
        description="Its files, results, elements and chats are added back. Your skills, folders and preferences are replaced by the ones in the backup. Keys on this device stay."
        onCancel={() => setPending(null)}
        onConfirm={() => void restore()}
      />
    </div>
  )
}
