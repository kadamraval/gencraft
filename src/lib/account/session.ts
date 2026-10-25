/**
 * Who is signed in on this device. A person signs in once; the app then works offline and does not ask again. A guest chose to continue
 * without an account (the only choice while accounts are not open).
 */
const KEY = "gencraft_account_v1"

export interface AccountSession {
  email?: string
  guest: boolean
  at: number
}

export function readSession(): AccountSession | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<AccountSession> | null
    return raw && typeof raw.guest === "boolean" ? { email: raw.email, guest: raw.guest, at: raw.at ?? 0 } : null
  } catch {
    return null
  }
}

export function writeSession(session: Omit<AccountSession, "at">): AccountSession {
  const next = { ...session, at: Date.now() }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // storage unavailable: the person is asked again next time
  }
  return next
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing stored
  }
}
