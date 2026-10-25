import type { ModelRecord, RegistryModality } from "./types"
import generated from "./shortlist.generated.json"

/**
 * The best models per kind of output, read from public arena leaderboards by `npm run shortlist:build`.
 *
 * Nothing here is typed by hand. The leaderboard says which models people rate highest and whether a model's
 * weights are public (it links the Hugging Face repository). The registry's own models are matched to those rows by
 * name, so a new model that climbs the board is picked up on the next build. Whether a model is open is kept for
 * the app's own use (which models to offer first); it is never shown as a label.
 */

export interface ShortlistEntry {
  modality: Exclude<RegistryModality, "text">
  /** Position on the board, 1 = best */
  rank: number
  name: string
  maker: string
  elo: number
  /** The weights are public: the board links the model's Hugging Face repository */
  open: boolean
  /** owner/name of that repository */
  weights?: string
  /** The licence field of that repository, when it could be read */
  license?: string
}

export interface Shortlist {
  builtAt: string
  entries: ShortlistEntry[]
}

export interface BoardRow {
  name: string
  creator?: string
  elo: number
  /** owner/name of the model's Hugging Face repository */
  weights?: string
}

/** Pages on huggingface.co that are not model repositories */
const NOT_A_MODEL = /^(collections|spaces|datasets|papers|blog|docs|organizations)\//

/** Reads the table of an Artificial Analysis leaderboard page: one row per model. */
export function parseLeaderboard(html: string): BoardRow[] {
  const rows: BoardRow[] = []
  for (const row of html.split(/<tr[\s>]/).slice(1)) {
    const name = row.match(/<span class="font-medium min-w-0 truncate[^"]*"[^>]*>([^<]+)<\/span>/)?.[1]
    const elo = row.match(/<span class="w-10 text-right">(\d+)<\/span>/)?.[1]
    if (!name || !elo) continue
    const repo = [...row.matchAll(/huggingface\.co\/([\w.-]+\/[\w.-]+)/g)].map((m) => m[1]!).find((r) => !NOT_A_MODEL.test(r))
    rows.push({
      name: name.replace(/&amp;/g, "&").trim(),
      creator: row.match(/alt="([^"]+?) logo"/)?.[1],
      elo: Number(elo),
      ...(repo ? { weights: repo } : {}),
    })
  }
  return rows
}

// Matching board names to registry models

/** Words that say what kind of thing a model is, not which model: they never decide a match */
const FILLER = new Set(["image", "images", "video", "model", "ai", "preview", "text", "to", "the", "and", "edit", "generate", "dreamina", "spacexai"])

/** Words that name a kind or a tier, not a model: many makers have a "TTS", a "Turbo" or a "Pro" */
const GENERIC = new Set(["tts", "hd", "turbo", "fast", "pro", "lite", "flash", "ultra", "mini", "max", "realtime", "speech", "v"])

/** Words in brackets on the board that describe a setting of the run, not the model ("(max)", "(768p)", "(Mar 2026)") */
const RUN_NOTE = /^(max|high|medium|low|xhigh|quality|fast|turbo|pro|lite|\d{3,4}p|[a-z]{3} \d{4}|\d{4}-\d{2}-\d{2})$/i

/** "3.0" and "v3" and "3" are the same version; "2.5" stays as it is */
const version = (t: string): string => t.replace(/^v(?=\d)/, "").replace(/^(\d+)\.0$/, "$1")

const tokenCache = new Map<string, string[]>()

export function tokensOf(text: string): string[] {
  const held = tokenCache.get(text)
  if (held) return held
  const tokens = text
    .toLowerCase()
    .replace(/\b\d{3,4}p\b/g, " ")
    .split(/[^a-z0-9.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean)
    .map(version)
    .filter((t) => !FILLER.has(t))
  tokenCache.set(text, tokens)
  return tokens
}

const namesCache = new Map<string, string[]>()

/** A board name, its names in brackets that really name the model, and the run notes it carries. */
export function namesOf(boardName: string): string[] {
  const held = namesCache.get(boardName)
  if (held) return held
  const main = boardName.replace(/\([^)]*\)/g, " ").trim()
  const inside = [...boardName.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]!.trim()).filter((s) => s && !RUN_NOTE.test(s))
  const names = [main, ...inside]
  namesCache.set(boardName, names)
  return names
}

const isNumber = (t: string) => /^\d+(\.\d+)?$/.test(t)

/**
 * How well a board name fits a registry model: 0 for no fit, up to 1 for an exact one.
 * The version numbers must be identical (2.1 is not 2.5), and every other word of the board name must appear in the
 * model's name or endpoint.
 */
export function matchScore(boardName: string, record: Pick<ModelRecord, "name" | "endpoint">, maker = ""): number {
  const haystack = tokensOf(`${record.name} ${record.endpoint.replace(/\//g, " ")}`)
  const recordNumbers = new Set(haystack.filter(isNumber))
  const makerTokens = tokensOf(maker)
  let best = 0
  for (const name of namesOf(boardName)) {
    const want = tokensOf(name)
    if (want.length === 0) continue
    // The same version numbers on both sides: 2.1 is not 2.5, and "Wan 3" is not "Wan 2.7"
    const numbers = want.filter(isNumber)
    if (numbers.length !== recordNumbers.size || numbers.some((n) => !recordNumbers.has(n))) continue
    const words = want.filter((t) => !isNumber(t))
    if (words.length === 0) continue
    const hit = words.filter((w) => haystack.includes(w)).length
    if (hit < words.length) continue
    // A name made only of generic words ("TTS-1 HD") fits any maker's model, so the maker has to agree as well
    if (words.every((w) => GENERIC.has(w)) && !makerTokens.some((t) => haystack.includes(t))) continue
    // Prefer the model whose own name carries nothing extra: "gpt-image-2.5-sunburst" over "gpt-image-2.5-sunburst-edit"
    const extra = haystack.filter((t) => !want.includes(t) && !isNumber(t)).length
    best = Math.max(best, 1 / (1 + extra * 0.25))
  }
  return best
}

const MIN_SCORE = 0.3

const list = (generated as Shortlist).entries ?? []

/** Matching is the costly part and a model's answer never changes between builds, so it is remembered. */
const entryCache = new Map<string, ShortlistEntry | undefined>()

/** The leaderboard row this model is, if it is on a board. The closest name wins; a better rank breaks a tie. */
export function entryFor(record: Pick<ModelRecord, "name" | "endpoint" | "modality">, entries: ShortlistEntry[] = list): ShortlistEntry | undefined {
  const key = entries === list ? `${record.modality}|${record.name}|${record.endpoint}` : ""
  if (key && entryCache.has(key)) return entryCache.get(key)
  let best: { e: ShortlistEntry; score: number } | undefined
  for (const e of entries) {
    if (e.modality !== record.modality) continue
    const score = matchScore(e.name, record, e.maker)
    if (score < MIN_SCORE) continue
    if (!best || score > best.score || (score === best.score && e.rank < best.e.rank)) best = { e, score }
  }
  if (key) entryCache.set(key, best?.e)
  return best?.e
}

/** Position on the board (1 = best), or undefined when the model is not on one. */
export const shortlistRank = (record: Pick<ModelRecord, "name" | "endpoint" | "modality">): number | undefined => entryFor(record)?.rank

/** The weights are public. For the app's own use only: this is never shown to a person. */
export const isOpenWeights = (record: Pick<ModelRecord, "name" | "endpoint" | "modality">): boolean => entryFor(record)?.open === true
