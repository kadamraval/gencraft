import { assertCanAdd } from "@/lib/license"
import * as React from "react"
import { PRESET_SKILLS } from "./presets"
import type { Skill, SkillScope } from "./types"

/**
 * Presets ship with the app and can be switched off. Skills the user writes are saved on this device.
 */

const KEY = "gencraft_skills_v1"

interface State {
  user: Skill[]
  /** Ids switched off (presets and the user's own) */
  off: string[]
}

function read(): State {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as State | null
    if (raw && Array.isArray(raw.user)) return { user: raw.user, off: raw.off ?? [] }
  } catch {
    // unreadable: start clean
  }
  return { user: [], off: [] }
}

let state: State = read()
let version = 0
const listeners = new Set<() => void>()

function commit(next: State) {
  state = next
  version++
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // storage unavailable: skills last for this session
  }
  listeners.forEach((l) => l())
}

export function addSkill(input: Omit<Skill, "id" | "origin">): Skill {
  assertCanAdd("skills", state.user.length)
  const skill: Skill = { ...input, id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, origin: "user" }
  commit({ ...state, user: [...state.user, skill] })
  return skill
}

export function updateSkill(id: string, patch: Partial<Omit<Skill, "id" | "origin">>) {
  commit({ ...state, user: state.user.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
}

export function removeSkill(id: string) {
  commit({ user: state.user.filter((s) => s.id !== id), off: state.off.filter((o) => o !== id) })
}

export function setSkillOn(id: string, on: boolean) {
  commit({ ...state, off: on ? state.off.filter((o) => o !== id) : [...new Set([...state.off, id])] })
}

export interface SkillView extends Skill {
  on: boolean
}

export function useSkills(): { presets: SkillView[]; mine: SkillView[] } {
  const [, tick] = React.useState(0)
  React.useEffect(() => {
    const l = () => tick((t) => t + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return React.useMemo(() => {
    const view = (s: Skill): SkillView => ({ ...s, on: !state.off.includes(s.id) })
    return { presets: PRESET_SKILLS.map(view), mine: state.user.map(view) }
  }, [version]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** The current skills outside a component, for the agent. */
export function getSkillsSnapshot(): { presets: SkillView[]; mine: SkillView[] } {
  const view = (s: Skill): SkillView => ({ ...s, on: !state.off.includes(s.id) })
  return { presets: PRESET_SKILLS.map(view), mine: state.user.map(view) }
}

/** The skills the composer offers in a mode: switched on and written for that kind of work. */
export function skillsFor(all: { presets: SkillView[]; mine: SkillView[] }, scope: SkillScope): SkillView[] {
  return [...all.mine, ...all.presets].filter((s) => s.on && s.appliesTo.includes(scope))
}
