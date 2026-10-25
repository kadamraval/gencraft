import * as React from "react"

/**
 * How the app looks: dark or light, and which skin light mode wears. Dark has one look and never changes.
 * The three skins only restyle light mode: Classic is the original light look, Glass is frosted, Neo is white
 * with no borders and a soft gradient. The choice is kept on this device.
 */
export type Skin = "classic" | "glass" | "neo"
export const SKINS: Array<{ id: Skin; name: string }> = [
  { id: "classic", name: "Classic" },
  { id: "glass", name: "Glass" },
  { id: "neo", name: "Neo" },
]

export interface Appearance {
  dark: boolean
  skin: Skin
}

const KEY = "gencraft_appearance_v1"

function read(): Appearance {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Appearance> | null
    return { dark: raw?.dark ?? true, skin: SKINS.some((s) => s.id === raw?.skin) ? (raw!.skin as Skin) : "classic" }
  } catch {
    return { dark: true, skin: "classic" }
  }
}

let state: Appearance = read()
const listeners = new Set<() => void>()

function apply() {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", state.dark)
  document.documentElement.dataset.skin = state.skin
}

// Applied as soon as the app loads, so the first paint already has the right look
apply()

export function setAppearance(patch: Partial<Appearance>) {
  state = { ...state, ...patch }
  apply()
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // storage unavailable: the choice lasts until the app closes
  }
  listeners.forEach((l) => l())
}

export function useAppearance(): Appearance {
  return React.useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
