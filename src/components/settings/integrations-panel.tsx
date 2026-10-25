import * as React from "react"
import { Check, Copy, ExternalLink, Eye, EyeOff, KeyRound, Loader2, Pin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ErrorNotice } from "@/components/ui/error-notice"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DropboxLogo, GoogleDriveLogo } from "@/components/chat/brand-logos"
import { ComposioError, disconnect, isConnected, openSignIn, startConnect, testComposioKey, waitForConnection } from "@/lib/integrations/composio"
import { CLOUD_TARGETS, readCloud, subscribeCloud, writeCloud } from "@/lib/integrations/cloud-sync"
import type { CloudTarget } from "@/lib/integrations/cloud-sync"
import type { SettingsState } from "@/types"
import { cn } from "@/lib/utils"

interface Props {
  settings: SettingsState
  onSave: (settings: SettingsState) => void
}

const row = "space-y-2.5 rounded-xl border border-border/70 bg-card p-3.5"

/** The sign-in for one app: start, wait for the browser, and the state in between. */
function useConnection(apiKey: string, toolkit: string) {
  const [connected, setConnected] = React.useState(() => isConnected(toolkit))
  const [waiting, setWaiting] = React.useState<{ url: string; accountId: string } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const abort = React.useRef<AbortController | null>(null)
  React.useEffect(() => () => abort.current?.abort(), [])

  const connect = async () => {
    setError(null)
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    try {
      const start = await startConnect(apiKey, toolkit)
      setWaiting(start)
      await openSignIn(start.url)
      await waitForConnection(apiKey, toolkit, start.accountId, { signal: controller.signal })
      setConnected(true)
      setWaiting(null)
    } catch (e) {
      if (controller.signal.aborted) return
      setWaiting(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const cancel = () => {
    abort.current?.abort()
    setWaiting(null)
  }
  const remove = async () => {
    setError(null)
    try {
      await disconnect(apiKey, toolkit)
      setConnected(false)
    } catch (e) {
      setError(e instanceof ComposioError ? e.message : String(e))
    }
  }
  return { connected, waiting, error, connect, cancel, remove }
}

/** One app's card: its name, Connect or Disconnect, the waiting message, and any settings it adds. */
function ConnectionCard({
  toolkit,
  apiKey,
  icon,
  title,
  subtitle,
  children,
}: {
  toolkit: string
  apiKey: string
  icon: React.ReactNode
  title: string
  subtitle: string
  children?: (connected: boolean) => React.ReactNode
}) {
  const c = useConnection(apiKey, toolkit)
  const [copied, setCopied] = React.useState(false)
  const copy = async () => {
    if (!c.waiting) return
    try {
      await navigator.clipboard.writeText(c.waiting.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // the link is shown on screen to copy by hand
    }
  }
  return (
    <div className={row}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary text-foreground">{icon}</span>
          <div>
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        {c.connected ? (
          <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" onClick={() => void c.remove()}>
            Disconnect
          </Button>
        ) : c.waiting ? (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={c.cancel}>
            Cancel
          </Button>
        ) : (
          <Button type="button" size="sm" className="h-7 text-xs" disabled={!apiKey} onClick={() => void c.connect()}>
            Connect {title}
          </Button>
        )}
      </div>

      {!apiKey && <p className="text-xs text-muted-foreground">Add your Composio key above first.</p>}
      {c.connected && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Connected
        </p>
      )}
      {c.waiting && (
        <div className="space-y-2 rounded-lg bg-secondary/40 p-3 text-xs">
          <p className="flex items-center gap-2 text-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Waiting for you to sign in to {title} in your browser
          </p>
          <p className="text-muted-foreground">If no page opened, open it here or copy the link. This screen updates by itself when you finish.</p>
          <div className="flex items-center gap-2">
            <Input readOnly value={c.waiting.url} className="h-8 text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void openSignIn(c.waiting!.url)}>
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </Button>
            <Button type="button" variant="secondary" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void copy()}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}
      {c.error && <ErrorNotice bare fallbackTitle={`Could not connect ${title}`} message={c.error} />}
      {children?.(c.connected)}
    </div>
  )
}

const ago = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`
}

/** What a cloud app adds: the folder, the switch for saving new results, and how the last saves went. */
function CloudSettings({ target, connected }: { target: CloudTarget; connected: boolean }) {
  const [, bump] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => subscribeCloud(bump), [])
  const cfg = readCloud(target)
  const [folder, setFolder] = React.useState(cfg.folder)
  if (!connected) return null
  return (
    <div className="space-y-2.5 border-t border-border/50 pt-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">Save new results automatically</p>
          <p className="text-xs text-muted-foreground">Every image, video and audio you make from now on is copied to your {CLOUD_TARGETS[target].label}.</p>
        </div>
        <Switch checked={cfg.enabled} onCheckedChange={(v) => writeCloud(target, { enabled: v })} aria-label={`Save new results to ${CLOUD_TARGETS[target].label}`} />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-14 flex-shrink-0 text-xs text-muted-foreground">Folder</span>
        <Input
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          onBlur={() => {
            const next = folder.trim() || CLOUD_TARGETS[target].defaultFolder
            setFolder(next)
            if (next !== cfg.folder) writeCloud(target, { folder: next, folderId: undefined })
          }}
          className="h-8 text-xs"
        />
      </div>
      {(cfg.saved > 0 || cfg.lastError) && (
        <p className={cn("text-xs", cfg.lastError ? "text-destructive" : "text-muted-foreground")}>
          {cfg.lastError ? `The last save failed: ${cfg.lastError}` : `${cfg.saved} saved${cfg.lastOkAt ? ` · last ${ago(cfg.lastOkAt)}` : ""}`}
        </p>
      )}
    </div>
  )
}

/**
 * Connect apps through Composio. The key is the person's own. Each app signs in on Composio's managed page, and
 * the app waits here until the sign-in is done.
 */
export function IntegrationsPanel({ settings, onSave }: Props) {
  const saved = settings.aiEngine.composioApiKey ?? ""
  const [draft, setDraft] = React.useState(saved)
  const [reveal, setReveal] = React.useState(false)
  const [checking, setChecking] = React.useState(false)
  const [keyError, setKeyError] = React.useState<string | null>(null)
  const [keyOk, setKeyOk] = React.useState(false)

  const saveKey = async () => {
    const key = draft.trim()
    setKeyError(null)
    setKeyOk(false)
    if (!key) {
      onSave({ ...settings, aiEngine: { ...settings.aiEngine, composioApiKey: "" } })
      return
    }
    setChecking(true)
    try {
      await testComposioKey(key)
      onSave({ ...settings, aiEngine: { ...settings.aiEngine, composioApiKey: key } })
      setKeyOk(true)
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 animate-in fade-in duration-150">
      <div className={row}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Composio</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 rounded-full", saved ? "bg-emerald-500" : "bg-muted-foreground/40")} />
              {saved ? "Key saved" : "No key"}
            </span>
          </div>
          <a href="https://platform.composio.dev" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Get a key <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">Composio signs in to your apps for you. Use a project API key (your project, Settings, API Keys), not the Connect key. It stays on this device. The free plan includes 100,000 tool calls a month.</p>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input type={reveal ? "text" : "password"} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Composio project API key" className="h-9 pr-9 text-xs" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="iconSm" aria-label={reveal ? "Hide key" : "Show key"} onClick={() => setReveal((v) => !v)} className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2">
                  {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{reveal ? "Hide" : "Show"}</TooltipContent>
            </Tooltip>
          </div>
          <Button type="button" size="sm" className="h-9 min-w-16" disabled={checking || draft.trim() === saved} onClick={() => void saveKey()}>
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : keyOk && draft.trim() === saved ? <Check className="h-3.5 w-3.5" /> : "Save"}
          </Button>
        </div>
        {keyError && <p className="text-xs text-destructive">{keyError}</p>}
      </div>

      <ConnectionCard toolkit="pinterest" apiKey={saved} icon={<Pin className="h-4 w-4" />} title="Pinterest" subtitle="Your boards and pins, and what is trending" />
      <ConnectionCard toolkit="googledrive" apiKey={saved} icon={<GoogleDriveLogo size={18} />} title="Google Drive" subtitle="Copy your results to a Drive folder">
        {(connected) => <CloudSettings target="googledrive" connected={connected} />}
      </ConnectionCard>
      <ConnectionCard toolkit="dropbox" apiKey={saved} icon={<DropboxLogo size={18} />} title="Dropbox" subtitle="Copy your results to a Dropbox folder">
        {(connected) => <CloudSettings target="dropbox" connected={connected} />}
      </ConnectionCard>

      <p className="px-1 text-xs text-muted-foreground">More apps (YouTube, Instagram) can be added the same way later.</p>
    </div>
  )
}
