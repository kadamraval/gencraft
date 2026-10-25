import * as React from "react"
import { explainError } from "../errors/explain"
import type { ErrorContext, ErrorKind } from "../errors/explain"

/**
 * Everything that goes wrong near the composer goes through here and shows as a small chip just above it. One list, so an error
 * never hides behind the composer, the same wording appears once, and every chip says what to do: try again, open settings, or
 * read the details. Keys and tokens are masked before anything is stored or shown.
 */

export type ChipLevel = "error" | "warning" | "info"
export type ChipKind = ErrorKind | "input" | "limit" | "note"
export type ChipActionId = "retry" | "settings"

export interface Chip {
  id: string
  /** The same key replaces the chip instead of adding a second one */
  key: string
  level: ChipLevel
  kind: ChipKind
  /** A few words, shown on the chip */
  title: string
  message: string
  hint?: string
  /** The provider's own words, masked, behind Details */
  raw?: string
  /** Which buttons the popover offers */
  actions: ChipActionId[]
  /** Settings tab to open for the settings action */
  settingsTab?: string
  /** Called by the retry action */
  retry?: () => void
  createdAt: number
}

export type ChipInput = Omit<Chip, "id" | "createdAt" | "actions"> & { actions?: ChipActionId[]; /** Goes away by itself after this many milliseconds */ ttl?: number }

const SECRET_PATTERNS: RegExp[] = [
  /\b(Bearer|Key|Token|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(api[_-]?key|apikey|token|secret|authorization|x-goog-api-key)["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(sk-[A-Za-z0-9_-]{8,}|r8_[A-Za-z0-9]{8,}|AIza[A-Za-z0-9_-]{12,}|fal_[A-Za-z0-9_-]{8,}|key_[A-Za-z0-9]{12,})\b/g,
]

/** Keys, tokens and authorization values replaced, wherever they appear in a message. */
export function maskSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((t, re) => t.replace(re, (m) => (/^(Bearer|Key|Token|Basic)\s/i.test(m) ? `${m.split(/\s+/)[0]} ••••` : m.includes("=") || m.includes(":") ? `${m.split(/[:=]/)[0]}: ••••` : "••••")), text)
}

/** Short titles for the chip, by kind. The full wording is in the popover. */
const TITLE: Record<ErrorKind, string> = {
  "no-key": "Add API key",
  auth: "Key rejected",
  "rate-limit": "Too many requests",
  credit: "Out of credits",
  safety: "Blocked by safety filter",
  "bad-input": "Setting rejected",
  "not-found": "Model unavailable",
  "provider-fault": "Provider error",
  timeout: "Timed out",
  network: "Offline",
  file: "File problem",
  unknown: "Something went wrong",
}

/** What each kind of error offers to do. Retry is only offered when it can help and there is something to retry. */
export function actionsFor(kind: ChipKind, retryable: boolean, hasRetry: boolean): ChipActionId[] {
  const out: ChipActionId[] = []
  if (kind === "no-key" || kind === "auth" || kind === "credit") out.push("settings")
  if (kind === "safety" || kind === "bad-input") out.push("settings")
  if (hasRetry && (retryable || kind === "unknown")) out.push("retry")
  return out
}

/** A chip from a provider's or the network's own words. */
export function chipFromError(raw: string, ctx: ErrorContext = {}, extra: { retry?: () => void; key?: string } = {}): ChipInput {
  const info = explainError(raw, ctx)
  const tab = info.kind === "bad-input" || info.kind === "safety" ? "models" : "providers"
  return {
    key: extra.key ?? `error:${info.kind}:${ctx.model ?? ""}`,
    level: "error",
    kind: info.kind,
    title: TITLE[info.kind],
    message: maskSecrets(info.message),
    hint: info.hint ? maskSecrets(info.hint) : undefined,
    raw: maskSecrets(info.raw),
    actions: actionsFor(info.kind, info.retryable, Boolean(extra.retry)),
    settingsTab: tab,
    retry: extra.retry,
  }
}

// The list

let chips: Chip[] = []
const listeners = new Set<() => void>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
let counter = 0
const emit = () => listeners.forEach((l) => l())

/** Adds a chip, or replaces the one with the same key. Returns its id. */
export function raiseChip(input: ChipInput): string {
  const { ttl, actions, ...rest } = input
  const existing = chips.find((c) => c.key === input.key)
  const id = existing?.id ?? `chip-${++counter}`
  const chip: Chip = { ...rest, message: maskSecrets(rest.message), raw: rest.raw ? maskSecrets(rest.raw) : undefined, actions: actions ?? [], id, createdAt: Date.now() }
  chips = existing ? chips.map((c) => (c.id === id ? chip : c)) : [...chips, chip]
  clearTimeout(timers.get(id))
  if (ttl && ttl > 0 && true) timers.set(id, setTimeout(() => dismissChip(id), ttl))
  emit()
  return id
}

export function dismissChip(id: string) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  const next = chips.filter((c) => c.id !== id)
  if (next.length !== chips.length) {
    chips = next
    emit()
  }
}

/** Removes the chips whose key matches: a warning whose cause has gone, or an error whose retry worked. */
export function clearChips(match: string | RegExp) {
  const hit = (k: string) => (typeof match === "string" ? k === match : match.test(k))
  const gone = chips.filter((c) => hit(c.key))
  if (gone.length === 0) return
  for (const c of gone) {
    clearTimeout(timers.get(c.id))
    timers.delete(c.id)
  }
  chips = chips.filter((c) => !hit(c.key))
  emit()
}

export function allChips(): Chip[] {
  return chips
}

export function useChips(): Chip[] {
  return React.useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => chips,
  )
}
