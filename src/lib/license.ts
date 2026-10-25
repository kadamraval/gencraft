import { LEGACY_LICENSE_PREFIX } from "./legacy-names"
import * as React from "react"
import publicKey from "./license-public.json"
import { LimitError } from "./notice"

/**
 * The license. A key is a signed note ("paid, for this person, on this date"). The app checks the signature with
 * a public key it carries, so nothing needs to be online. Without a valid key the app is on the Free plan.
 */

export interface LicenseInfo {
  plan: "free" | "paid"
  licensee?: string
  issued?: string
  /** One Year or Lifetime. Keys sold before the plans existed carry neither and are lifetime. */
  term?: "year" | "lifetime"
  /** Last day a One Year key works (YYYY-MM-DD) */
  expires?: string
}

/** What the Free plan allows. Paid has no limits. */
export const FREE_LIMITS = { projects: 1 } as const
export type LimitKind = keyof typeof FREE_LIMITS

/** Features that are part of the paid plan only. The Free plan has everything else. */
export type Feature = "agent" | "buildApps" | "connectors"
const FREE_FEATURES: Record<Feature, boolean> = { agent: false, buildApps: false, connectors: false }
export const FEATURE_NAMES: Record<Feature, string> = { agent: "Agents", buildApps: "Building your own Apps", connectors: "Connectors" }

/** True when a One Year key has run out. `today` is YYYY-MM-DD. Lifetime keys (no date) never run out. */
export const licenseExpired = (expires: string | undefined, today: string): boolean => Boolean(expires) && today > (expires as string)

/** Whether a plan includes a feature */
export const planHas = (plan: LicenseInfo["plan"], feature: Feature): boolean => plan === "paid" || FREE_FEATURES[feature]

const STORE_KEY = "gencraft_license_v1"
/** New keys start with GC-; keys issued before the rename start with the old prefix and stay valid */
const PREFIXES = ["GC-", LEGACY_LICENSE_PREFIX]

const fromB64url = (s: string): Uint8Array<ArrayBuffer> => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4)
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Checks a key. Returns what it says when the signature is right, otherwise null. */
export async function verifyLicense(key: string): Promise<LicenseInfo | null> {
  try {
    const text = key.trim()
    const prefix = PREFIXES.find((p) => text.startsWith(p))
    if (!prefix) return null
    const [payloadPart, signaturePart] = text.slice(prefix.length).split(".")
    if (!payloadPart || !signaturePart) return null
    const payload = fromB64url(payloadPart)
    const verifyKey = await crypto.subtle.importKey("jwk", publicKey as JsonWebKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"])
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, verifyKey, fromB64url(signaturePart), payload)
    if (!ok) return null
    const body = JSON.parse(new TextDecoder().decode(payload)) as { plan?: string; licensee?: string; issued?: string; term?: string; expires?: string }
    if (body.plan !== "paid") return null
    if (licenseExpired(body.expires, new Date().toISOString().slice(0, 10))) return null
    return { plan: "paid", licensee: body.licensee, issued: body.issued, term: body.term === "year" ? "year" : "lifetime", expires: body.expires }
  } catch {
    return null
  }
}

let info: LicenseInfo = { plan: "free" }
const listeners = new Set<() => void>()

function publish(next: LicenseInfo) {
  info = next
  listeners.forEach((l) => l())
}

export function savedLicenseKey(): string {
  try {
    return localStorage.getItem(STORE_KEY) ?? ""
  } catch {
    return ""
  }
}

/** Reads the saved key once at launch and again after a change. */
export async function loadLicense(): Promise<void> {
  const key = savedLicenseKey()
  publish((key && (await verifyLicense(key))) || { plan: "free" })
}

export async function activateLicense(key: string): Promise<LicenseInfo | null> {
  const verified = await verifyLicense(key)
  if (!verified) return null
  try {
    localStorage.setItem(STORE_KEY, key.trim())
  } catch {
    // storage unavailable: the license lasts until the app closes
  }
  publish(verified)
  return verified
}

export function removeLicense() {
  try {
    localStorage.removeItem(STORE_KEY)
  } catch {
    // nothing stored
  }
  publish({ plan: "free" })
}

export function getLicense(): LicenseInfo {
  return info
}

export function useLicense(): LicenseInfo {
  return React.useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => info,
  )
}

export const hasFeature = (feature: Feature): boolean => planHas(info.plan, feature)

/** True when the current plan includes the feature; the screen updates when a key is added or removed */
export function useFeature(feature: Feature): boolean {
  return planHas(useLicense().plan, feature)
}

/** Stops an addition that goes past the Free plan. Paid is never limited. */
export function assertCanAdd(kind: LimitKind, current: number): void {
  if (info.plan === "paid" || current < FREE_LIMITS[kind]) return
  const names: Record<LimitKind, string> = { projects: "project" }
  throw new LimitError(`The Free plan has ${FREE_LIMITS[kind]} ${names[kind]}. Paid has no limit: add a license key in Settings, General.`)
}

void loadLicense()
