import { activateLicense } from "@/lib/license"
import type { LicenseInfo } from "@/lib/license"

/**
 * Where a person's plan comes from. Today it is a licence key checked on this device (the local provider). When the BOSS service is connected, a
 * second provider registers itself here: it signs people up, takes the payment and returns what the plan includes, and the screens that ask
 * (first-run setup, Settings, the upgrade card) keep working unchanged. The Free plan never calls a provider: it needs no account.
 */
export interface AccountProvider {
  id: "local" | "boss"
  /** True when this provider can sell: sign up, pay and unlock by itself */
  canBuy: boolean
  /** Unlocks the paid plan with a licence key; null when the key is not valid */
  activateKey: (key: string) => Promise<LicenseInfo | null>
}

export const localAccount: AccountProvider = { id: "local", canBuy: false, activateKey: activateLicense }

let current: AccountProvider = localAccount

export const getAccountProvider = (): AccountProvider => current

/** Called once by the BOSS connection when it exists */
export function setAccountProvider(provider: AccountProvider): void {
  current = provider
}
