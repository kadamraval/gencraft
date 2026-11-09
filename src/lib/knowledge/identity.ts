import { isOpenWeights, shortlistRank } from "../registry/shortlist"
import type { ModelRecord } from "../registry/types"
import type { MakerList } from "../sheet/types"

/**
 * Who made a provider's endpoint, which one model it is, whether its weights are public and how popular it is. None of the provider
 * lists says who the maker is, so it is read from the names the provider uses (the account or folder an endpoint sits in, the model's
 * family) against the maker list (`makers.json`: each maker's id, its `aliases` and its declared models). Words: docs/terms.md.
 */

/** Folders that are the provider itself, not a maker: the maker is the next segment */
const HOST_FOLDERS = new Set(["fal-ai", "fal"])
/** Endpoint segments that name a task, a region or a tier of one model, not a different model */
const NOT_MODEL = /^(text|image|video|audio|reference|keyframes|first-last-frame|speech)-to-(image|video|audio|speech|text)$|^(edit|edit-image|edit-video|image-edit|video-edit|us|standard|pro|turbo|4k|draft|v\d+-?api)$/

export interface MakerIndex {
  /** alias or declared model word -> maker id */
  byName: Map<string, string>
  weights: Map<string, "open" | "closed" | "mixed">
  names: Map<string, string>
  declared: Set<string>
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

export function makerIndex(list: MakerList): MakerIndex {
  const byName = new Map<string, string>()
  const weights = new Map<string, "open" | "closed" | "mixed">()
  const names = new Map<string, string>()
  const declared = new Set<string>()
  for (const mk of list.makers) {
    names.set(mk.id, mk.name)
    if (mk.weights) weights.set(mk.id, mk.weights)
    byName.set(mk.id, mk.id)
    byName.set(slug(mk.name), mk.id)
    for (const a of mk.aliases ?? []) byName.set(a, mk.id)
    for (const m of mk.models) {
      declared.add(m.id.split("/").slice(0, 2).join("/"))
      // A declared model's first word names its maker too ("Seedance" is ByteDance), unless the maker is the open-source shelf
      const first = slug(m.name).split("-")[0]
      if (first && mk.id !== "opensource" && !byName.has(first)) byName.set(first, mk.id)
    }
  }
  return { byName, weights, names, declared }
}

/** The account or folder the endpoint sits in, and the rest of its path */
function split(rec: Pick<ModelRecord, "provider" | "endpoint">): { owner: string; rest: string[] } {
  const parts = rec.endpoint.toLowerCase().split("/").filter(Boolean)
  if (parts.length > 1 && HOST_FOLDERS.has(parts[0]!)) return { owner: parts[1]!, rest: parts.slice(1) }
  return { owner: parts[0] ?? rec.provider, rest: parts.slice(1) }
}

/** The account an endpoint sits in (after a host's own folder): who published it on the provider */
export const ownerOf = (rec: Pick<ModelRecord, "provider" | "endpoint">): string => split(rec).owner

/**
 * The maker of an endpoint, only when the endpoint is the maker's own. On Replicate anyone can publish a model, so the account must be the
 * maker's (its id, its name or an alias on the maker list): a copy of a famous model under a person's account, or a name that merely
 * resembles a maker's, is a community upload and has no maker. fal, OpenRouter, OpenAI and Gemini list no community uploads (every
 * endpoint is the provider's own or a partner's), so the maker list's reading of the name stands there.
 */
export function officialMakerOf(rec: Pick<ModelRecord, "provider" | "endpoint" | "name">, index: MakerIndex): { id: string } | undefined {
  const found = makerOf(rec, index)
  if (!found.known) return undefined
  if (rec.provider !== "replicate") return { id: found.id }
  const owner = ownerOf(rec)
  const accounts = hubAuthors(found.id, index)
  return accounts.has(owner) ? { id: found.id } : undefined
}

/** The maker of an endpoint: its owner, the owner's first word, or the model's first word, as the maker list knows them. Otherwise the owner itself, marked unknown. */
export function makerOf(rec: Pick<ModelRecord, "provider" | "endpoint" | "name">, index: MakerIndex): { id: string; known: boolean } {
  const { owner } = split(rec)
  const tries = [owner, owner.split("-")[0]!, slug(rec.name).split("-")[0]!]
  for (const t of tries) {
    const id = t ? index.byName.get(t) : undefined
    if (id) return { id, known: true }
  }
  return { id: slug(owner) || rec.provider, known: false }
}

/** The model an endpoint is, without its task, region or tier: "fal-ai/kling-video/v3/pro/text-to-video" is "kling-video-v3" */
export function modelSlugOf(rec: Pick<ModelRecord, "provider" | "endpoint">): string {
  const { owner, rest } = split(rec)
  // Under a host folder the rest starts with the model's own folder ("kling-video"); under a maker's account it starts after it
  const kept = rest.filter((s) => !NOT_MODEL.test(s))
  const path = kept.length > 0 ? kept : [owner]
  // A version written with a dot or a dash is the same version: 2.1 and 2-1
  return slug(path.join("-").replace(/\./g, "-"))
}

/**
 * Whether a model's weights are public, from the strongest source that says: the leaderboard, the provider's own page (a weights or source
 * link), Hugging Face (the maker's own organisation publishes them), then a maker that publishes all or none. Unknown otherwise.
 */
export function weightsOf(rec: Pick<ModelRecord, "name" | "endpoint" | "category" | "weights">, makerId: string, index: MakerIndex, onHub?: boolean): "open" | "closed" | undefined {
  const board = shortlistRank(rec) !== undefined ? (isOpenWeights(rec) ? "open" : "closed") : undefined
  if (board) return board
  if (rec.weights) return rec.weights
  if (onHub) return "open"
  const w = index.weights.get(makerId)
  return w === "open" || w === "closed" ? w : undefined
}

/** The names a maker publishes under on Hugging Face: its id, its name and its aliases */
export function hubAuthors(makerId: string, index: MakerIndex): Set<string> {
  const out = new Set([makerId, slug(index.names.get(makerId) ?? "")])
  for (const [alias, id] of index.byName) if (id === makerId) out.add(alias)
  return out
}

/** Lower is more popular: the leaderboard rank, then the provider's own popularity, then the newest */
export function popularityOf(rec: ModelRecord): [number, number, string] {
  const board = shortlistRank(rec) ?? 1000
  const runs = -(rec.runs ?? 0) - (rec.featured ? 1e9 : 0)
  return [board, runs, rec.updatedAt ?? ""]
}

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
/** What may follow a model's name in a published repository and still be that model: a task, a size, a format ("Wan2.2-T2V-A14B") */
const REPO_SUFFIX = /^(t2v|i2v|ti2v|s2v|r2v|v2v|flf2v|dev|base|diffusers|hf|fp8|bf16|a?\d+b)*$/

/** True when one of the maker's own Hugging Face repositories is this model: its name, then only a task, size or format */
export function publishedOnHub(modelId: string, repos: string[]): boolean {
  // The full name first, then without its trailing words (a tier such as "fast"), as long as the family and its version remain
  const words = (modelId.split("/")[1] ?? "").split("-").filter(Boolean)
  const tries: string[] = []
  for (let n = words.length; n >= 2; n--) {
    const part = words.slice(0, n)
    if (part.some((w) => /\d/.test(w))) tries.push(compact(part.join("")))
  }
  if (tries.length === 0 && words.length > 0) tries.push(compact(words.join("")))
  return tries.some((want) => want.length >= 3 && repos.some((r) => {
    const name = compact(r.split("/")[1] ?? r)
    return name.startsWith(want) && REPO_SUFFIX.test(name.slice(want.length))
  }))
}

/** The model's own name without maker, version or task: the first part of its path ("fal-ai/birefnet/v2" and "men1scus/birefnet" are both "birefnet") */
export function nameKey(rec: Pick<ModelRecord, "provider" | "endpoint">): string {
  const { owner, rest } = split(rec)
  return compact((rest[0] ?? owner).replace(/[-_.]?v?\d+([-_.]\d+)*$/, ""))
}

/** True when a public repository is this model by name: the name, then only a task, size or format, and people use it (downloads) */
export function publicRepoMatches(key: string, repos: Array<{ id: string; downloads?: number }>): boolean {
  if (key.length < 4) return false
  return repos.some((r) => {
    const name = compact(r.id.split("/")[1] ?? r.id)
    return (r.downloads ?? 0) >= 500 && name.startsWith(key) && REPO_SUFFIX.test(name.slice(key.length).replace(/^\d+(?=\D|$)/, ""))
  })
}
