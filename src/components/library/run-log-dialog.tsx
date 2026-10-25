import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ErrorNotice } from "@/components/ui/error-notice"
import type { DetailMediaItem } from "@/components/media-vault/media-detail-modal"
import { cn } from "@/lib/utils"

/** A log line without its leading symbol, and what the symbol said about it. */
function readLine(line: string): { text: string; tone: "ok" | "warn" | "bad" | "plain" } {
  const tone = line.startsWith("✓") ? "ok" : line.startsWith("⚠") || line.includes("[Failover") ? "warn" : line.startsWith("❌") ? "bad" : "plain"
  return { text: line.replace(/^[^\p{L}\p{N}[]+/u, "").trim() || line, tone }
}

const DOT = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-destructive", plain: "bg-muted-foreground/50" }

const label = "text-xs font-medium text-muted-foreground"

/** What happened in a run: why it failed, what was sent, and the steps that ran, in order. */
export function RunLogDialog({ item, onClose, onRetry }: { item: DetailMediaItem | null; onClose: () => void; onRetry?: (item: DetailMediaItem) => void }) {
  const copy = () => {
    if (!item) return
    const text = [`${item.title} · ${item.model ?? ""} · ${item.createdAt ?? ""}`, `Prompt: ${item.prompt}`, `Error: ${item.errorInfo?.raw ?? item.error ?? ""}`, `Settings: ${JSON.stringify(item.params ?? {})}`, "", ...(item.log ?? [])].join("\n")
    void navigator.clipboard?.writeText(text)
  }
  const settings = Object.entries(item?.params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== "" && typeof v !== "object")
  const lines = (item?.log ?? []).map(readLine)

  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg gap-4">
        <DialogHeader>
          <DialogTitle className="text-base">Run log</DialogTitle>
          <DialogDescription>
            {[item?.model, item?.createdAt].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>

        {(item?.errorInfo || item?.error) && <ErrorNotice bare info={item.errorInfo} fallbackTitle="Did not generate" message={item.error} />}

        <div className="space-y-1.5">
          <div className={label}>Prompt</div>
          <p className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg bg-secondary/40 px-3 py-2 text-xs leading-relaxed text-foreground">{item?.prompt}</p>
        </div>

        {settings.length > 0 && (
          <div className="space-y-1.5">
            <div className={label}>Settings sent</div>
            <div className="flex flex-wrap gap-1.5">
              {settings.map(([k, v]) => (
                <span key={k} className="rounded-md border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground">
                  {k.replace(/_/g, " ")} <span className="text-foreground">{String(v)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <div className={label}>Steps</div>
          <ol className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg bg-secondary/40 px-3 py-2.5">
            {lines.length === 0 ? (
              <li className="text-xs text-muted-foreground">No steps were recorded.</li>
            ) : (
              lines.map((l, i) => (
                <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                  <span className={cn("mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full", DOT[l.tone])} />
                  <span className={l.tone === "bad" ? "text-foreground" : "text-muted-foreground"}>{l.text}</span>
                </li>
              ))
            )}
          </ol>
        </div>

        <DialogFooter className="gap-1.5 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={copy} className="gap-1.5">
            <Copy className="h-3.5 w-3.5" />
            Copy log
          </Button>
          <div className="flex gap-1.5">
            {onRetry && item && (
              <Button type="button" variant="secondary" size="sm" onClick={() => onRetry(item)}>
                Try again
              </Button>
            )}
            <Button type="button" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
