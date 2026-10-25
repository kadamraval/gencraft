import * as React from "react"
import { computeDefaultEnabled } from "./enabled"
import type { ModelRecord } from "./types"

/**
 * Bookmarked models (the ★). They come first in every picker, then a divider, then every other model. A bookmark only orders a list and
 * never hides a model. The models a person had switched on before bookmarks existed become their first bookmarks, so nothing changes
 * for them on the day this arrives; a person with no saved choice starts with the best models of each kind.
 */

const KEY = "gencraft_bookmarks_v1"
let marks: Set<string> | null = null
let started = false
const listeners = new Set<() => void>()
let snapshot: ReadonlySet<string> = new Set()

function read(): Set<string> | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

function commit(next: Set<string>) {
  marks = next
  snapshot = new Set(next)
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]))
  } catch {
    // storage unavailable: bookmarks last until the app closes
  }
  for (const l of listeners) l()
}

function load() {
  if (marks) return
  const saved = read()
  marks = saved ?? new Set()
  started = saved !== null
  snapshot = new Set(marks)
}

export function isBookmarked(id: string): boolean {
  load()
  return marks!.has(id)
}

/** The bookmarked ids now (not a hook: agents read it when they run) */
export function listBookmarks(): string[] {
  load()
  return [...marks!]
}

export function toggleBookmark(id: string) {
  load()
  const next = new Set(marks!)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  started = true
  commit(next)
}

export function addBookmark(id: string) {
  load()
  if (marks!.has(id)) return
  started = true
  commit(new Set([...marks!, id]))
}

/** Called once models are known: seeds the bookmarks the first time (from the old switched-on list, or the best of each kind). */
export function seedBookmarks(listed: ModelRecord[], legacy: string[] | undefined) {
  load()
  if (started || listed.length === 0) return
  const current = new Set(listed.map((r) => r.id))
  const ids = legacy && legacy.length > 0 ? legacy : computeDefaultEnabled(listed)
  started = true
  commit(new Set(ids.filter((id) => current.has(id))))
}

/** The bookmarked ids, redrawn when one changes */
export function useBookmarks(): ReadonlySet<string> {
  load()
  return React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => snapshot,
  )
}

/** Bookmarked models first, each group keeping its own order */
export function bookmarkedFirst<T extends { id: string }>(items: T[], marked: ReadonlySet<string>): { starred: T[]; rest: T[] } {
  return { starred: items.filter((m) => marked.has(m.id)), rest: items.filter((m) => !marked.has(m.id)) }
}
