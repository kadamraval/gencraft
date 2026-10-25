/** Which "look at this" onboarding steps the person has already opened. Kept on this device. */
const KEY = "gencraft_onboarding_v1"

export type SeenStep = "general"

export function getOnboardingSeen(step: SeenStep): boolean {
  try {
    return Boolean((JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>)[step])
  } catch {
    return false
  }
}

export function markOnboardingSeen(step: SeenStep) {
  try {
    const now = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>
    localStorage.setItem(KEY, JSON.stringify({ ...now, [step]: true }))
  } catch {
    // storage unavailable: the step simply stays open
  }
}

// ---- first-run setup

const SETUP_KEY = "gencraft_setup_v1"

export type Plan = "free" | "paid"
export type SetupStep = "plan" | "account" | "profile" | "project" | "keys" | "drive" | "folder" | "done"

export interface SetupState {
  /** The person finished or skipped the setup: it is not shown again unless they ask for it */
  done: boolean
  step: SetupStep
  plan: Plan
}

const FRESH: SetupState = { done: false, step: "plan", plan: "free" }

export function readSetup(): SetupState {
  try {
    const raw = JSON.parse(localStorage.getItem(SETUP_KEY) ?? "null") as Partial<SetupState> | null
    return raw ? { ...FRESH, ...raw } : { ...FRESH }
  } catch {
    return { ...FRESH }
  }
}

export function writeSetup(patch: Partial<SetupState>): SetupState {
  const next = { ...readSetup(), ...patch }
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(next))
  } catch {
    // storage unavailable: setup runs again next time
  }
  return next
}

/** Run setup again from Settings */
export function resetSetup(): void {
  writeSetup({ done: false, step: "plan" })
}

/**
 * Whether the app should open on the first-run setup. Only for a new install: a device that already has settings, a lock or any saved data from an
 * earlier version is treated as set up, so nobody who already uses the app is walked through it.
 */
export function shouldShowSetup(): boolean {
  try {
    if (readSetup().done) return false
    if (localStorage.getItem(SETUP_KEY) !== null) return true
    return localStorage.getItem("gencraft_studio_settings") === null && localStorage.getItem("gencraft_lock_v1") === null && localStorage.getItem("gencraft_apps_v1") === null
  } catch {
    return false
  }
}

/** The steps of the setup in order: the Paid plan adds the account step after the plan choice */
export const stepsFor = (plan: Plan): SetupStep[] =>
  plan === "paid" ? ["plan", "account", "profile", "project", "keys", "drive", "folder", "done"] : ["plan", "profile", "project", "keys", "drive", "folder", "done"]
