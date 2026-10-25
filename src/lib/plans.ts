import { FEATURE_NAMES, FREE_LIMITS } from "./license"

/**
 * What Free and Paid include, in one place. The Pricing screen, the plan card in Settings and the website table read it, so the
 * words and the real limits (`FREE_LIMITS`, `planHas`) cannot drift apart.
 */

export interface PlanRow {
  main: string
  sub: string
  free: string
  paid: string
}

const YES = "Yes"
const NO = "No"

export const PLAN_ROWS: PlanRow[] = [
  { main: "Projects", sub: "", free: `${FREE_LIMITS.projects} project`, paid: "Unlimited" },
  { main: "Create & Edit", sub: "Chat, Image, Video, Audio", free: YES, paid: YES },
  { main: "Story", sub: "Script, Cast, Beats, Edit", free: YES, paid: YES },
  { main: "Agents", sub: "Plan", free: NO, paid: YES },
  { main: "", sub: "Batch Create & Edit", free: NO, paid: YES },
  { main: "", sub: "Skills", free: NO, paid: YES },
  { main: "", sub: "More Automation", free: NO, paid: YES },
  { main: "Brand", sub: "Brand kits", free: "Unlimited", paid: "Unlimited" },
  { main: "Elements", sub: "Characters, Places, Products, Props, Cameras, Lights, Styles", free: YES, paid: YES },
  { main: "Library", sub: "Files and folders", free: YES, paid: YES },
  { main: "Apps", sub: "Run built-in Apps", free: YES, paid: YES },
  { main: "", sub: "Build your own", free: NO, paid: YES },
  { main: "Connectors", sub: "Google Drive, Dropbox, Pinterest", free: NO, paid: YES },
  { main: "BYOK", sub: "fal, Replicate, OpenRouter, OpenAI, Gemini, Usage", free: YES, paid: YES },
  { main: "Support", sub: "Help", free: YES, paid: YES },
  { main: "", sub: "Email", free: NO, paid: YES },
]

/** Paid is one plan with two ways to pay: the same features either way. Prices are in US dollars. */
export const PRICES = {
  year: { label: "One Year", usd: 39, line: "$39 for one year" },
  lifetime: { label: "Lifetime", usd: 99, line: "$99 once, for good" },
} as const

/** The features the plan card names when it says what Free is missing */
export const FREE_MISSING = [FEATURE_NAMES.agent, FEATURE_NAMES.connectors, FEATURE_NAMES.buildApps, "Email support"]
