import * as React from "react"
import { Check, Eye, EyeOff, ExternalLink, KeyRound, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ModelLogo } from "@/components/ui/model-logo"
import { EmptyState } from "@/components/ui/empty-state"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PROVIDERS } from "@/lib/registry/providers"
import { getKeyState, getLastChecked, getLiveRecords, nextCheckAt, registrySaveFailed, setKeyState, unlockProvider, useRegistry, useUnlockStatus } from "@/lib/registry/store"
import { sanitizeApiKey, testProviderConnection } from "@/lib/providers/live-connectors"
import type { ProviderId as LedgerProviderId } from "@/lib/ledger/usage-store"
import type { SettingsState } from "@/types"
import { cn } from "@/lib/utils"

type Provider = (typeof PROVIDERS)[number]

function ago(ms: number | undefined): string {
  if (!ms) return ""
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

function until(ms: number | undefined): string {
  if (!ms) return ""
  const s = Math.round((ms - Date.now()) / 1000)
  if (s <= 0) return "due now"
  if (s < 3600) return `in ${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `in ${Math.round(s / 3600)} h`
  return `in ${Math.round(s / 86400)} d`
}

/** Providers say "no" in different ways. A rejected key must not unlock anything; a network failure must not lock the user out. */
const REJECTED = /HTTP (400|401|403)|invalid|unauthor|forbidden|not valid/i

interface Props {
  provider: Provider
  settings: SettingsState
  onSave: (settings: SettingsState) => void
}

/** One compact row: which provider, whether it is connected, the key, and a single Save that verifies and loads models. */
export function ProviderKeyBar({ provider, settings, onSave }: Props) {
  useRegistry() // re-renders when key status or loading progress changes
  const saved = (settings.aiEngine[provider.keyField] as string | undefined) ?? ""
  const [draft, setDraft] = React.useState(saved)
  const [reveal, setReveal] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const unlock = useUnlockStatus(provider.id)
  const keyState = getKeyState(provider.id)

  // Replicate lists nothing without a key, so its models are read as soon as the panel opens with a key and an empty
  // list, as Save would do. A failure is shown here and is not retried in a loop.
  React.useEffect(() => {
    if (provider.id !== "replicate" || !saved || keyState?.status === "rejected" || unlock.state !== "idle") return
    if (getLiveRecords().some((r) => r.provider === "replicate")) return
    void unlockProvider(provider.id, saved)
  }, [provider.id, saved, keyState?.status, unlock.state])

  React.useEffect(() => {
    setDraft(saved)
    setReveal(false)
  }, [provider.id, saved])

  const persist = (key: string) => {
    const next: SettingsState = { ...settings, aiEngine: { ...settings.aiEngine, [provider.keyField]: key } }
    onSave(next)
    try {
      localStorage.setItem("gencraft_studio_settings", JSON.stringify(next))
    } catch {
      // storage unavailable: the key stays for this session
    }
  }

  const save = async () => {
    const key = sanitizeApiKey(draft)
    setDraft(key)
    if (!key) {
      persist("")
      setKeyState(provider.id, null)
      return
    }
    setBusy(true)
    persist(key)
    setKeyState(provider.id, { status: "checking", checkedAt: Date.now() })
    const res = await testProviderConnection(provider.id as LedgerProviderId, key)
    if (res.ok) {
      setKeyState(provider.id, { status: "ok", checkedAt: Date.now() })
      void unlockProvider(provider.id, key)
    } else if (res.error && REJECTED.test(res.error)) {
      setKeyState(provider.id, { status: "rejected", checkedAt: Date.now(), message: res.error })
    } else {
      // Could not reach the provider to verify. Keep the key and load what we can.
      setKeyState(provider.id, { status: "unverified", checkedAt: Date.now(), message: res.error })
      void unlockProvider(provider.id, key)
    }
    setBusy(false)
  }

  const status = !saved ? "none" : keyState?.status === "rejected" ? "rejected" : keyState?.status === "checking" ? "checking" : keyState?.status === "unverified" ? "unverified" : "ok"
  const chip = {
    none: { text: "No key", dot: "bg-muted-foreground/40" },
    checking: { text: "Checking", dot: "bg-amber-500" },
    ok: { text: "Connected", dot: "bg-emerald-500" },
    unverified: { text: "Saved, not verified", dot: "bg-amber-500" },
    rejected: { text: "Key rejected", dot: "bg-destructive" },
  }[status]

  // Only what needs attention is said here: progress while loading, a failure, a rejected key. A good result says nothing.
  const line =
    unlock.state === "loading"
      ? `${unlock.message ?? "Loading"}${unlock.total ? ` ${unlock.done}/${unlock.total}` : ""}`
      : unlock.state === "error"
        ? unlock.message
        : status === "rejected"
          ? "The provider rejected this key. Check it and save again."
          : unlock.state !== "done" && status === "unverified"
            ? "Could not reach the provider to verify. Models loaded from the last check."
            : ""

  const checkedAt = getLastChecked(provider.id)

  return (
    <div className="space-y-2 rounded-xl border border-border/70 bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ModelLogo provider={provider.id} size={16} />
          <span className="text-sm font-semibold text-foreground">{provider.label}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 rounded-full", chip.dot)} />
            {chip.text}
          </span>
        </div>
        <a href={provider.keyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          Get a key <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type={reveal ? "text" : "password"}
            value={draft}
            placeholder={provider.keyHint}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void save()}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text")
              if (pasted) {
                e.preventDefault()
                setDraft(sanitizeApiKey(pasted))
              }
            }}
            className="h-8 pl-8 pr-8 font-mono text-xs"
          />
          <Button type="button" variant="ghost" size="iconSm" aria-label={reveal ? "Hide key" : "Show key"} onClick={() => setReveal(!reveal)} className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2">
            {reveal ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>
        </div>
        <Button type="button" size="sm" onClick={() => void save()} disabled={busy || draft === saved && status !== "none" && status !== "rejected"} className="h-8 min-w-16">
          {busy || unlock.state === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : status === "ok" && draft === saved ? <Check className="h-3.5 w-3.5" /> : "Save"}
        </Button>
        {saved && status !== "rejected" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Check again" disabled={unlock.state === "loading"} onClick={() => void unlockProvider(provider.id, saved)}>
                <RefreshCw className={cn("h-3.5 w-3.5", unlock.state === "loading" && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{`Check the live catalog and prices again${checkedAt ? ` · last checked ${ago(checkedAt)}, next ${until(nextCheckAt(provider.id))}` : ""}`}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {registrySaveFailed() && <p className="text-xs text-destructive">The browser would not keep the model list, so it may need to load again next time.</p>}
      {line && <p className={cn("text-xs", unlock.state === "error" || status === "rejected" ? "text-destructive" : "text-muted-foreground")}>{line}</p>}
    </div>
  )
}

/** Shown until the provider has a working key. It disappears the moment one is accepted. */
export function NoKeyBanner({ provider, rejected }: { provider: Provider; rejected: boolean }) {
  return (
    <EmptyState
      icon={KeyRound}
      title={rejected ? `${provider.label} rejected that key` : `Add your ${provider.label} key to load its models`}
      hint={rejected ? "Paste a valid key above and save." : "Nothing is shown until a key is added. Once it is, the live catalog and prices load, and you choose which models appear in chat."}
    />
  )
}
