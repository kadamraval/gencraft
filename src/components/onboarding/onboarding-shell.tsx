import * as React from "react"
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The frame every first-run screen sits in, so they all look and behave alike: a header with the logo and a named stepper, a scrolling
 * body with one title block, and a footer with Back, an optional Skip and one main button in the same place.
 */

export interface StepInfo {
  id: string
  label: string
}

export function Stepper({ steps, at }: { steps: StepInfo[]; at: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label={`Step ${at + 1} of ${steps.length}`}>
      {steps.map((s, i) => {
        const done = i < at
        const here = i === at
        return (
          <li key={s.id} className="flex items-center gap-2" aria-current={here ? "step" : undefined}>
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                here && "border-primary bg-primary text-primary-foreground",
                done && "border-primary/60 bg-primary/15 text-primary",
                !here && !done && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={cn("hidden text-xs font-medium sm:inline", here ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
            {i < steps.length - 1 && <span aria-hidden="true" className={cn("h-px w-4 sm:w-8", done ? "bg-primary/60" : "bg-border")} />}
          </li>
        )
      })}
    </ol>
  )
}

interface ShellProps {
  steps: StepInfo[]
  at: number
  title: string
  line: string
  /** A small note under the title, for example the beta notice */
  note?: string
  /** A picture above the title */
  art?: React.ReactNode
  /** Wide screens (pricing) use more room */
  wide?: boolean
  canSkipSetup: boolean
  onSkipSetup: () => void
  onBack: () => void
  /** A smaller button beside the main one, for a step that can be left empty */
  skipLabel?: string
  onSkip?: () => void
  mainLabel: string
  mainDisabled?: boolean
  busy?: boolean
  onMain: () => void
  children: React.ReactNode
}

export function OnboardingShell({ steps, at, title, line, note, art, wide, canSkipSetup, onSkipSetup, onBack, skipLabel, onSkip, mainLabel, mainDisabled, busy, onMain, children }: ShellProps) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="setup-title" className="fixed inset-0 z-[95] flex flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-4 border-b border-border/60 px-6 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card font-mono text-xs font-bold">GC</span>
          Gencraft
        </span>
        <Stepper steps={steps} at={at} />
        {canSkipSetup ? (
          <Button type="button" variant="ghost" size="sm" onClick={onSkipSetup}>
            Skip setup
          </Button>
        ) : (
          <span className="w-20" />
        )}
      </header>

      {/* The whole page scrolls; the title and the content share one column */}
      <main className="flex-1 overflow-y-auto px-6 py-8">
        <div className={cn("mx-auto flex min-h-full flex-col justify-center gap-6", wide ? "max-w-5xl" : "max-w-md")}>
          <div className="space-y-2 text-center">
            {art}
            <h1 id="setup-title" className={cn("font-semibold tracking-tight", wide ? "text-3xl" : "text-xl")}>
              {title}
            </h1>
            <p className="mx-auto max-w-xl text-sm text-muted-foreground">{line}</p>
            {note && <p className="text-xs text-muted-foreground">{note}</p>}
          </div>
          {children}
        </div>
      </main>

      <footer className="flex items-center justify-between gap-3 border-t border-border/60 px-6 py-3">
        <Button type="button" variant="ghost" size="sm" className={cn("gap-1.5", at === 0 && "invisible")} onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          {skipLabel && onSkip && (
            <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
              {skipLabel}
            </Button>
          )}
          <Button type="button" size="lg" className="min-w-40 gap-1.5" disabled={mainDisabled || busy} onClick={onMain}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mainLabel}
            {!busy && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </footer>
    </div>
  )
}

/** The one surface every first-run form sits on */
export function StepCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("space-y-4 rounded-2xl border border-border bg-card p-5", className)}>{children}</div>
}
