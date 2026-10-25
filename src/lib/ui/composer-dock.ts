import * as React from "react"

/**
 * Where the composer sits and how wide the right dock is. One setting for every screen that has a composer (Create, Story), so
 * docking it right in one place docks it right everywhere, and the same width is used. Saved on this device.
 */

export type DockSide = "bottom" | "right"

export const DOCK_DEFAULT: { side: DockSide; width: number } = { side: "bottom", width: 22 }
/** The right dock's width as a percentage of the page area, kept within these limits */
export const DOCK_MIN = 18
export const DOCK_MAX = 45

const KEY = "gencraft_composer_dock_v1"

export const clampDockWidth = (w: number): number => (Number.isFinite(w) ? Math.min(DOCK_MAX, Math.max(DOCK_MIN, w)) : DOCK_DEFAULT.width)

type State = { side: DockSide; width: number }

function read(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<State>
      return { side: parsed.side === "right" ? "right" : "bottom", width: clampDockWidth(Number(parsed.width ?? DOCK_DEFAULT.width)) }
    }
  } catch {
    // storage unavailable or unreadable: the default holds
  }
  return { ...DOCK_DEFAULT }
}

let state: State = read()
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // the choice just will not persist
  }
  listeners.forEach((l) => l())
}

export const dock = {
  get: (): State => state,
  setSide: (side: DockSide) => set({ ...state, side }),
  setWidth: (width: number) => set({ ...state, width: clampDockWidth(width) }),
  reset: () => set({ ...state, width: DOCK_DEFAULT.width }),
}

/**
 * Bottom space for a feed that runs behind a bottom-docked composer: the composer's real height (it publishes `--composer-h`,
 * strip and chips included) plus a little air. Nothing in a feed is ever hidden behind the composer.
 */
export const FEED_BOTTOM_PAD: React.CSSProperties = { paddingBottom: "calc(var(--composer-h, 11rem) + 1.5rem)" }

/** The shared dock choice and its setters. Every screen with a composer reads this one. */
export function useComposerDock() {
  const current = React.useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
  return { side: current.side, width: current.width, setSide: dock.setSide, setWidth: dock.setWidth, reset: dock.reset }
}
