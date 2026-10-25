import * as React from "react"
import { AlertCircle, Check, ChevronDown, Clock, Copy, FileWarning, KeyRound, SearchX, ServerCrash, ShieldAlert, SlidersHorizontal, Wallet, WifiOff } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ErrorKind, FriendlyError } from "@/lib/errors/explain"
import { cn } from "@/lib/utils"

/** One icon and one tone per kind of failure, so the same problem always looks the same. */
export const ERROR_LOOK: Record<ErrorKind, { icon: LucideIcon; tone: "warn" | "bad" }> = {
  "no-key": { icon: KeyRound, tone: "warn" },
  auth: { icon: KeyRound, tone: "bad" },
  "rate-limit": { icon: Clock, tone: "warn" },
  credit: { icon: Wallet, tone: "warn" },
  safety: { icon: ShieldAlert, tone: "warn" },
  "bad-input": { icon: SlidersHorizontal, tone: "bad" },
  "not-found": { icon: SearchX, tone: "bad" },
  "provider-fault": { icon: ServerCrash, tone: "bad" },
  timeout: { icon: Clock, tone: "warn" },
  network: { icon: WifiOff, tone: "warn" },
  file: { icon: FileWarning, tone: "bad" },
  unknown: { icon: AlertCircle, tone: "bad" },
}

/** The round icon that stands for a failure. Used on cards, tiles and in the Log. */
export function ErrorBadge({ kind, className }: { kind?: ErrorKind; className?: string }) {
  const look = ERROR_LOOK[kind ?? "unknown"]
  const Icon = look.icon
  return (
    <span className={cn("flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full", look.tone === "warn" ? "bg-amber-500/15 text-amber-500" : "bg-destructive/15 text-destructive", className)}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  )
}

interface ErrorNoticeProps {
  info?: FriendlyError
  /** Shown when the failure could not be explained */
  fallbackTitle: string
  message?: string
  onOpenSettings?: () => void
  onRetry?: () => void
  /** Leave out the buttons, for places that have their own */
  bare?: boolean
}

/**
 * A failed run in plain words: what happened, what to do, and one or two buttons. The provider's own text sits
 * behind "Technical details" for anyone who wants it.
 */
export function ErrorNotice({ info, fallbackTitle, message, onOpenSettings, onRetry, bare }: ErrorNoticeProps) {
  const [open, setOpen] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  // Everything on the card, as plain text, for pasting into a message or a bug report
  const copyAll = () => {
    const text = [info?.title ?? fallbackTitle, info?.message ?? message, info?.hint, info?.raw ? `Technical details:\n${info.raw}` : ""].filter(Boolean).join("\n\n")
    void navigator.clipboard?.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  const look = ERROR_LOOK[info?.kind ?? "unknown"]
  const canSettings = info?.action === "settings" && onOpenSettings
  const canRetry = (info?.retryable || info?.action === "retry") && onRetry
  return (
    <div className={cn("select-text overflow-hidden rounded-xl border border-border bg-card text-xs", "border-l-2", look.tone === "warn" ? "border-l-amber-500" : "border-l-destructive")}>
      <div className="flex gap-2.5 p-3">
        <ErrorBadge kind={info?.kind} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-medium leading-tight text-foreground">{info?.title ?? fallbackTitle}</div>
            <Button type="button" variant="ghost" size="iconSm" aria-label="Copy error" onClick={copyAll} className="h-6 w-6 flex-shrink-0 p-0 text-muted-foreground hover:text-foreground">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
          {(info?.message ?? message) && <p className="leading-relaxed text-muted-foreground">{info?.message ?? message}</p>}
          {info?.hint && <p className="leading-relaxed text-foreground/80">{info.hint}</p>}
          {!bare && (canSettings || canRetry) && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {canSettings && (
                <Button type="button" size="sm" className="h-7 px-2.5 text-xs" onClick={onOpenSettings}>
                  Open Settings
                </Button>
              )}
              {canRetry && (
                <Button type="button" size="sm" variant={canSettings ? "ghost" : "secondary"} className="h-7 px-2.5 text-xs" onClick={onRetry}>
                  Try again
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      {info?.raw && (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1 border-t border-border/60 px-3 py-1.5 text-left text-muted-foreground transition-colors hover:text-foreground">
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
            Technical details
          </button>
          {open && <pre className="max-h-32 overflow-auto whitespace-pre-wrap border-t border-border/60 bg-secondary/30 px-3 py-2 font-mono text-xs text-muted-foreground">{info.raw}</pre>}
        </>
      )}
    </div>
  )
}
