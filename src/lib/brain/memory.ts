import * as React from "react"

/**
 * What the assistant remembers about the person and their work: a short list of facts, kept on this device, shown and
 * editable in Settings, and sent with every chat and agent run. Secrets are never kept.
 */

export interface Memory {
  id: string
  text: string
  createdAt: number
}

const KEY = "gencraft_brain_memory_v1"
const MAX_ITEMS = 100
const MAX_CHARS = 300

/** Keys, tokens, passwords and card numbers are refused: a memory is sent to a model with every message. */
const SECRET = /(sk-[a-z0-9_-]{10,}|r8_[a-z0-9]{10,}|AIza[0-9a-z_-]{20,}|bearer\s+[a-z0-9._-]{12,}|(api[_ -]?key|password|passcode|secret|token|pin)\s*(is|:|=)\s*\S{4,}|\b(?:\d[ -]?){13,19}\b|[a-z0-9+/_-]{32,})/i

let items: Memory[] = []
const listeners = new Set<() => void>()
let version = 0

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    items = raw ? (JSON.parse(raw) as Memory[]).filter((m) => m && typeof m.text === "string") : []
  } catch {
    items = []
  }
}
load()

function commit(next: Memory[]) {
  items = next
  version++
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // storage unavailable: memories last until the app closes
  }
  listeners.forEach((l) => l())
}

export const listMemory = (): Memory[] => items

export type AddResult = { ok: true; memory: Memory } | { ok: false; reason: string }

export function addMemory(text: string): AddResult {
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean.length < 3) return { ok: false, reason: "Nothing to remember." }
  if (SECRET.test(clean)) return { ok: false, reason: "That looks like a key, password or number that must stay secret, so it was not saved." }
  const text300 = clean.slice(0, MAX_CHARS)
  const same = items.find((m) => m.text.toLowerCase() === text300.toLowerCase())
  if (same) return { ok: true, memory: same }
  const memory: Memory = { id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: text300, createdAt: Date.now() }
  commit([memory, ...items].slice(0, MAX_ITEMS))
  return { ok: true, memory }
}

export function updateMemory(id: string, text: string) {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS)
  if (!clean || SECRET.test(clean)) return
  commit(items.map((m) => (m.id === id ? { ...m, text: clean } : m)))
}

export const removeMemory = (id: string) => commit(items.filter((m) => m.id !== id))
export const clearMemory = () => commit([])

/** The memories that share words with the question, best first. All of them when there is no question. */
export function recallMemory(query: string, limit = 8): Memory[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  if (words.length === 0) return items.slice(0, limit)
  return items
    .map((m) => ({ m, score: words.filter((w) => m.text.toLowerCase().includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.m)
}

/** The block added to the system text: every memory, capped so it never crowds the conversation */
export function memoryBlock(): string {
  if (items.length === 0) return ""
  const lines: string[] = []
  let size = 0
  for (const m of items) {
    if (size + m.text.length > 2500) break
    lines.push(`- ${m.text}`)
    size += m.text.length
  }
  return `Things you remember about this person (use them naturally, never recite the list):\n${lines.join("\n")}`
}

export function useMemory(): Memory[] {
  const [, tick] = React.useState(0)
  React.useEffect(() => {
    const l = () => tick((t) => t + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return React.useMemo(() => items, [version]) // eslint-disable-line react-hooks/exhaustive-deps
}
