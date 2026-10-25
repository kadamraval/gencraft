import { activateLicense } from "@/lib/license"
import type { LicenseInfo } from "@/lib/license"

/**
 * Where a person's plan comes from. Today it is a licence key checked on this device (the local provider). When the BOSS service is connected, a
 * second provider registers itself here: it signs people up, takes the payment and returns what the plan includes, and the screens that ask
 * (first-run setup, Settings, the upgrade card) keep working unchanged. The Free plan never calls a provider: it needs no account.
 */
export type AccountResult = { ok: true } | { ok: false; message: string }

export interface AccountProvider {
  id: "local" | "boss"
  /** True when accounts really exist: sign up sends a code by email, login checks a password. False in the beta stand-in. */
  accounts: boolean
  /** True when this provider can sell: pay and unlock by itself */
  canBuy: boolean
  /** Unlocks the paid plan with a licence key; null when the key is not valid */
  activateKey: (key: string) => Promise<LicenseInfo | null>
  /** Creates the account and sends the 6-digit code to the email */
  signUp: (email: string, password: string) => Promise<AccountResult>
  /** Checks the code from the email */
  verify: (email: string, code: string) => Promise<AccountResult>
  /** Signs in an existing account (once per device) */
  login: (email: string, password: string) => Promise<AccountResult>
}

const NOT_OPEN: AccountResult = { ok: false, message: "Accounts are not open yet. Continue as a guest for now." }

/** The beta stand-in: no network and no accounts. Nothing is created or sent; the screens say so. */
export const localAccount: AccountProvider = {
  id: "local",
  accounts: false,
  canBuy: false,
  activateKey: activateLicense,
  signUp: async () => NOT_OPEN,
  verify: async () => NOT_OPEN,
  login: async () => NOT_OPEN,
}

let current: AccountProvider = localAccount

export const getAccountProvider = (): AccountProvider => current

/** Called once by the BOSS connection when it exists */
export function setAccountProvider(provider: AccountProvider): void {
  current = provider
}
