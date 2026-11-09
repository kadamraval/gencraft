import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface PinInputProps {
  value: string
  onChange: (value: string) => void
  /** Called once when every box is filled */
  onComplete?: (value: string) => void
  length?: number
  autoFocus?: boolean
  disabled?: boolean
  invalid?: boolean
  /** Dots instead of digits (a PIN); false for a code that is read from an email */
  mask?: boolean
  label: string
  /** Smaller boxes for a settings card */
  size?: "md" | "sm"
  className?: string
}

/** A PIN or code in separate boxes: typing moves to the next box, Backspace goes back, and a pasted number fills them all. */
export function PinInput({ value, onChange, onComplete, length = 6, autoFocus, disabled, invalid, mask = true, label, size = "md", className }: PinInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([])
  // The newest value, so a second key pressed before the screen has redrawn builds on the first one
  const latest = React.useRef(value)
  latest.current = value
  const digits = Array.from({ length }, (_, i) => value[i] ?? "")

  const focusAt = (i: number) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus()
  const commit = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, length)
    latest.current = clean
    onChange(clean)
    if (clean.length === length) onComplete?.(clean)
    return clean
  }

  return (
    <div role="group" aria-label={label} className={cn("flex justify-center", size === "sm" ? "gap-1.5" : "gap-2", className)}>
      {digits.map((d, i) => (
        <Input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          type={mask ? "password" : "text"}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          value={d}
          aria-label={`${label}, digit ${i + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            let typed = e.target.value.replace(/\D/g, "")
            if (!typed) return commit(latest.current.slice(0, i) + latest.current.slice(i + 1))
            // A digit typed into a box that already had one: keep the new digit only
            if (d && typed.length === 2) typed = typed.replace(d, "") || typed.slice(-1)
            // Several digits at once (an autofilled code): they fill this box and the ones after it
            commit(latest.current.slice(0, i) + typed + latest.current.slice(i + typed.length))
            focusAt(Math.min(length - 1, i + typed.length))
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d) {
              e.preventDefault()
              commit(latest.current.slice(0, Math.max(0, i - 1)) + latest.current.slice(i))
              focusAt(i - 1)
            } else if (e.key === "ArrowLeft") focusAt(i - 1)
            else if (e.key === "ArrowRight") focusAt(i + 1)
          }}
          onPaste={(e) => {
            e.preventDefault()
            const next = commit(e.clipboardData.getData("text"))
            focusAt(next.length >= length ? length - 1 : next.length)
          }}
          className={cn("rounded-xl px-0 text-center font-semibold", size === "sm" ? "h-9 w-9 text-sm" : "h-12 w-11 text-lg", invalid && "border-destructive")}
        />
      ))}
    </div>
  )
}
