/**
 * The password that locks the app. It is a screen lock: the password itself is never stored, only a salted hash
 * of it, and no password is set until the person chooses one (nothing is locked before that).
 *
 * Older versions kept the password as plain text under the keys named in legacy-names.ts (and the lock
 * screen read a different one from the one Settings wrote). Those are read once, turned into a hash and deleted.
 */
import { LEGACY_LOCK_KEYS } from "../legacy-names"


const KEY = "gencraft_lock_v1"
const SESSION_KEY = "gencraft_unlocked"
const OLD_LOCK_KEY = LEGACY_LOCK_KEYS.lock
const OLD_SETTINGS_KEY = LEGACY_LOCK_KEYS.settings
/** What the old lock screen printed on screen. It was never a password the person chose. */
const OLD_DEFAULT = "cinematic"
const ITERATIONS = 600_000

interface Stored {
  salt: string
  hash: string
  iterations: number
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
const fromHex = (hex: string): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2))
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, 256)
  return toHex(new Uint8Array(bits))
}

/** Compares two equal-length hex strings without stopping at the first difference. */
function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<Stored>
    return typeof s.salt === "string" && typeof s.hash === "string" && typeof s.iterations === "number" ? (s as Stored) : null
  } catch {
    return null
  }
}

/** A plain-text password left by an older version that the person actually chose, if there is one. */
function legacyPassword(): string | null {
  try {
    const fromSettings = localStorage.getItem(OLD_SETTINGS_KEY)
    if (fromSettings) return fromSettings
    const fromLock = localStorage.getItem(OLD_LOCK_KEY)
    return fromLock && fromLock !== OLD_DEFAULT ? fromLock : null
  } catch {
    return null
  }
}

function forgetLegacy() {
  try {
    localStorage.removeItem(OLD_LOCK_KEY)
    localStorage.removeItem(OLD_SETTINGS_KEY)
    localStorage.removeItem(LEGACY_LOCK_KEYS.session)
  } catch {
    // nothing stored
  }
}

/** True when a password has been chosen, so the app should start locked. */
export function hasPassword(): boolean {
  return readStored() !== null || legacyPassword() !== null
}

async function store(password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)))
  const hash = await derive(password, salt, ITERATIONS)
  localStorage.setItem(KEY, JSON.stringify({ salt: toHex(salt), hash, iterations: ITERATIONS } satisfies Stored))
  forgetLegacy()
}

export async function checkPassword(password: string): Promise<boolean> {
  const stored = readStored()
  if (stored) return sameHash(await derive(password, fromHex(stored.salt), stored.iterations), stored.hash)
  const old = legacyPassword()
  if (old === null || password !== old) return false
  // The right old password: keep it as a hash from now on
  try {
    await store(password)
  } catch {
    // storage refused: it still unlocks this time
  }
  return true
}

/** Sets or changes the password. When one is already set, the current one has to be right. */
export async function setPassword(next: string, current?: string): Promise<"ok" | "wrong-current"> {
  if (hasPassword() && !(await checkPassword(current ?? ""))) return "wrong-current"
  await store(next)
  return "ok"
}

/** Removes the lock. The current password has to be right. */
export async function removePassword(current: string): Promise<boolean> {
  if (!(await checkPassword(current))) return false
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing stored
  }
  forgetLegacy()
  markUnlocked(false)
  return true
}

// Unlocked for this run of the app only: closing the app, or locking it, asks for the password again.

export function isUnlockedNow(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1"
  } catch {
    return false
  }
}

export function markUnlocked(unlocked: boolean) {
  try {
    if (unlocked) sessionStorage.setItem(SESSION_KEY, "1")
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // session storage unavailable: the lock asks again after a reload
  }
}

/** The app starts locked when a password is set and it has not been entered in this run. */
export function startsLocked(): boolean {
  return hasPassword() && !isUnlockedNow()
}
