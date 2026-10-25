import * as React from "react"

/**
 * Runs wait their turn. A few run at once (set in Settings, General, Limits); the rest wait in the order they were
 * sent and start as soon as one finishes. Sending is never refused for being busy, and a run that is still waiting
 * can be cancelled. Providers queue and rate limit on their side too, so a small number here also avoids their
 * "too many requests" answers.
 */

/** The same few at a time that Midjourney allows on its lower plans */
export const DEFAULT_CONCURRENT_RUNS = 3

export interface RunSlot {
  /** True when the run had to wait for a free place */
  waited: boolean
  /** Resolves true when the run may start, false when it was cancelled while waiting */
  ready: Promise<boolean>
  /** Gives the place back. Safe to call more than once. */
  release: () => void
}

interface Waiter {
  id: string
  start: (go: boolean) => void
}

let limit = DEFAULT_CONCURRENT_RUNS
let running = 0
const waiting: Waiter[] = []
const listeners = new Set<() => void>()
let waitingIds: readonly string[] = []

function emit() {
  waitingIds = waiting.map((w) => w.id)
  listeners.forEach((l) => l())
}

function pump() {
  while (running < limit && waiting.length > 0) {
    running++
    waiting.shift()!.start(true)
  }
  emit()
}

/** Changing the limit applies at once: a bigger one starts waiting runs, a smaller one lets the current ones finish. */
export function setRunLimit(n: number | undefined) {
  limit = Math.max(1, Math.round(n ?? DEFAULT_CONCURRENT_RUNS))
  pump()
}

/** Asks for a place to run. `id` names the run so it can be shown as waiting and cancelled. */
export function requestSlot(id: string): RunSlot {
  let holding = false
  const release = () => {
    if (!holding) return
    holding = false
    running--
    pump()
  }
  if (running < limit && waiting.length === 0) {
    running++
    holding = true
    return { waited: false, ready: Promise.resolve(true), release }
  }
  const ready = new Promise<boolean>((resolve) => {
    waiting.push({
      id,
      start: (go) => {
        if (go) holding = true
        resolve(go)
      },
    })
  })
  emit()
  return { waited: true, ready, release }
}

/** Takes a waiting run out of the line. A run that already started is not stopped. */
export function cancelQueued(id: string): boolean {
  const at = waiting.findIndex((w) => w.id === id)
  if (at < 0) return false
  waiting.splice(at, 1)[0]!.start(false)
  emit()
  return true
}

/** What to tell the person about a place in the line */
export const describePlace = (position: number) => (position <= 1 ? "Next in line" : `${position - 1} ahead`)

/** Where a run stands in the line: 1 is next, 0 means it is not waiting. */
export function useQueuePosition(id: string): number {
  const ids = React.useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => waitingIds,
  )
  return ids.indexOf(id) + 1
}
