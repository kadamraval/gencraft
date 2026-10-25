import * as React from "react"

/**
 * A short message shown at the top of the window, clear of the composer. Used when something cannot be done and the person needs to
 * know why (a plan limit, a spend limit), from places that have no room for a message of their own.
 */
let current: { id: number; message: string } | null = null
const listeners = new Set<() => void>()
let counter = 0

export function showNotice(message: string) {
  const id = ++counter
  current = { id, message }
  listeners.forEach((l) => l())
  window.setTimeout(() => {
    if (current?.id === id) {
      current = null
      listeners.forEach((l) => l())
    }
  }, 6000)
}

export function dismissNotice() {
  current = null
  listeners.forEach((l) => l())
}

export function useNotice(): string | null {
  return React.useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current?.message ?? null,
  )
}

/** Thrown by a store when a plan limit stops an addition. */
export class LimitError extends Error {}

/** Runs something that may hit a plan limit. The limit is shown as a notice and undefined comes back. */
export function limited<T>(run: () => T): T | undefined {
  try {
    return run()
  } catch (e) {
    if (e instanceof LimitError) {
      showNotice(e.message)
      return undefined
    }
    throw e
  }
}

/** The async form of `limited`. */
export async function limitedAsync<T>(run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run()
  } catch (e) {
    if (e instanceof LimitError) {
      showNotice(e.message)
      return undefined
    }
    throw e
  }
}

// A yes or no question before something costly runs

let question: { title: string; description: string; resolve: (yes: boolean) => void } | null = null
const questionListeners = new Set<() => void>()

export function askYesNo(title: string, description: string): Promise<boolean> {
  return new Promise((resolve) => {
    question = {
      title,
      description,
      resolve: (yes) => {
        question = null
        questionListeners.forEach((l) => l())
        resolve(yes)
      },
    }
    questionListeners.forEach((l) => l())
  })
}

export function useQuestion() {
  return React.useSyncExternalStore(
    (l) => {
      questionListeners.add(l)
      return () => questionListeners.delete(l)
    },
    () => question,
  )
}
