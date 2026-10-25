import * as React from "react"
import { SYSTEM_APPS } from "./system-apps"
import type { AppSpec } from "./types"

/**
 * The person's own apps and the results of every run, kept on this device. System apps are not stored: they come with the
 * studio. Results (pictures, video, sound) live in the Library like everything else; a run only remembers which ones.
 */

const APPS_KEY = "gencraft_apps_v1"
const RUNS_KEY = "gencraft_app_runs_v1"
const MAX_RUNS_PER_APP = 30

export interface AppRun {
  id: string
  appId: string
  at: number
  texts: Array<{ title: string; text: string }>
  assetIds: string[]
  costUsd: number
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

let mine: AppSpec[] = read<AppSpec[]>(APPS_KEY, [])
let runs: AppRun[] = read<AppRun[]>(RUNS_KEY, [])
const listeners = new Set<() => void>()
let version = 0

function commit() {
  version++
  try {
    localStorage.setItem(APPS_KEY, JSON.stringify(mine))
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs))
  } catch {
    // storage unavailable: apps last until the app closes
  }
  listeners.forEach((l) => l())
}

export const listMyApps = (): AppSpec[] => mine
export const getApp = (id: string): AppSpec | undefined => SYSTEM_APPS.find((a) => a.id === id) ?? mine.find((a) => a.id === id)

export function saveApp(spec: AppSpec): AppSpec {
  const saved: AppSpec = { ...spec, system: false, createdAt: spec.createdAt ?? Date.now() }
  mine = [saved, ...mine.filter((a) => a.id !== saved.id)]
  commit()
  return saved
}

export function removeApp(id: string) {
  mine = mine.filter((a) => a.id !== id)
  runs = runs.filter((r) => r.appId !== id)
  commit()
}

/** A copy of any app as the person's own, to change */
export const remix = (spec: AppSpec): AppSpec => ({ ...JSON.parse(JSON.stringify(spec)), id: newAppId(), system: false, createdAt: Date.now(), name: spec.system ? spec.name : `${spec.name} copy` })

export const newAppId = () => `app_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

export function addRun(run: AppRun) {
  const others = runs.filter((r) => r.appId === run.appId)
  const dropped = new Set(others.slice(MAX_RUNS_PER_APP - 1).map((r) => r.id))
  runs = [run, ...runs.filter((r) => !dropped.has(r.id))]
  commit()
}

export const clearRuns = (appId: string) => {
  runs = runs.filter((r) => r.appId !== appId)
  commit()
}

export function useApps(): { system: AppSpec[]; mine: AppSpec[] } {
  const [, tick] = React.useState(0)
  React.useEffect(() => {
    const l = () => tick((t) => t + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return React.useMemo(() => ({ system: SYSTEM_APPS, mine }), [version]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function useRuns(appId: string): AppRun[] {
  const [, tick] = React.useState(0)
  React.useEffect(() => {
    const l = () => tick((t) => t + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return React.useMemo(() => runs.filter((r) => r.appId === appId), [version, appId]) // eslint-disable-line react-hooks/exhaustive-deps
}
