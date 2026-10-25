import type { ParamSchema, PriceRule, PriceUnit, RegistryModality } from "../registry/types"

/**
 * The standard model database. It is the set of sheets we agreed (Makers, Models, Jobs, Capabilities, Parameters, Providers, Provider
 * lines, Sources, Gaps, Completeness; Safety comes later) written as one JSON pack. The build makes it from named sources; the app reads
 * nothing else for what a model can do, which settings it takes, what it costs and where it runs.
 *
 * Two rules hold everywhere: a value either comes from a source (kept on the line with its address and date) or it is absent and listed
 * in `gaps`; and a model is published only when its lines are complete (see `validatePack`).
 */

export const PACK_SCHEMA_VERSION = 1

/** Where in the app a job is used */
export type UsedIn = "create" | "audio" | "edit" | "story" | "agent" | "library"

/** The providers a line can be on */
export type Provider = "fal" | "replicate" | "openrouter" | "openai" | "gemini"

/** How a fact reached the database, in the order they are tried */
export type FactFrom = "standard" | "litellm" | "api" | "page" | "maker"

export interface PackJob {
  /** The id the code uses: a tool id (video-upscale) or a category for making things (text-to-video) */
  id: string
  name: string
  /** tool: changes a file the person has. create: makes something from a prompt. */
  kind: "tool" | "create"
  group: RegistryModality
  /** input to output, the industry name */
  category: string
  takesIn: string
  mayTake: string | null
  gives: string
  alsoKnownAs: string[]
  usedIn: UsedIn[]
}

export interface PackMaker {
  id: string
  name: string
  country?: string
  docsUrl?: string
  ownApi?: boolean
  weights?: "open" | "closed" | "mixed"
}

export interface PackPrice {
  unit: PriceUnit
  amount: number | null
  outputAmount?: number
  cachedAmount?: number
  /** Replicate hardware billing: the rate per second */
  computeSecond?: number
  rules?: PriceRule[]
  from: FactFrom
  sourceUrl?: string
  readOn: string
}

/** One model on one provider doing one job */
export interface PackLine {
  provider: Provider
  endpoint: string
  jobId: string
  /** 1 is the first choice for this job on this provider; 2 and up are its backups */
  rank: number
  /** model: the maker's own. substitute: the provider's own newest for the job. alternative: a model that follows instructions and does the job by being told to. */
  role: "model" | "substitute" | "alternative"
  price: PackPrice
  /** The settings, in the registry's shape, with the provider's own field names */
  params: ParamSchema
  status: "active" | "preview" | "deprecated"
  /** Providers' own names for the job that confirmed it */
  seenBy: string[]
  /** A second source differs by more than 10 percent */
  conflict?: boolean
  /** The provider's own version id, for providers that run a version (Replicate) */
  providerVersion?: string
}

export interface PackModel {
  /** Canonical: maker/family-version, the same on every provider */
  id: string
  makerId: string
  name: string
  version?: string
  type: RegistryModality
  category: string
  /** Jobs this model does, from Capabilities */
  jobs: string[]
  releasedOn?: string
  status: "active" | "preview" | "deprecated"
  /** The newest stable version of its family */
  latest: boolean
  replaces?: string
  retiresAt?: string
  lines: PackLine[]
}

export interface PackSource {
  provider: Provider | "litellm" | "maker"
  method: FactFrom
  url: string
  readOn: string
  /** For litellm: the commit the file was read at */
  pinnedTo?: string
  /** How many models the provider's own list held when it was read (the next build compares against it) */
  count?: number
}

export interface PackGap {
  modelId: string
  provider: Provider | "-"
  field: "job" | "settings" | "price" | "endpoint" | "backups"
  reason: string
  /** A top model left out for a missing price: the build stops until a reader is fixed or the owner accepts it (see unpriced-allowed.json) */
  blocking?: boolean
}

export interface PackCompleteness {
  scope: string
  total: number
  filled: number
  score: number
}

export interface KnowledgePack {
  schemaVersion: number
  generatedAt: string
  makers: PackMaker[]
  jobs: PackJob[]
  models: PackModel[]
  sources: PackSource[]
  gaps: PackGap[]
  completeness: PackCompleteness[]
  /** Newer versions of a maker's family than the maker list names, found in a provider's own list and added automatically */
  newVersions?: Array<{ declared: string; found: string; provider: Provider; endpoint: string }>
  /** Set by the publisher; the app refuses a pack whose signature does not verify */
  signature?: string
}

/**
 * The reasons a pack cannot be published or loaded. An empty list means every model in it is complete: a job it does, settings, a price
 * (or a stated reason there is none) and an endpoint on every line, with rank 1 present for each job on each provider it is on.
 */
export function validatePack(pack: KnowledgePack): string[] {
  const problems: string[] = []
  if (pack.schemaVersion !== PACK_SCHEMA_VERSION) problems.push(`schemaVersion ${pack.schemaVersion} is not ${PACK_SCHEMA_VERSION}`)
  const jobIds = new Set(pack.jobs.map((j) => j.id))
  const makerIds = new Set(pack.makers.map((m) => m.id))
  const seen = new Set<string>()
  const ranks = new Map<string, number[]>()
  for (const m of pack.models) {
    if (seen.has(m.id)) problems.push(`${m.id}: listed twice`)
    seen.add(m.id)
    if (!makerIds.has(m.makerId)) problems.push(`${m.id}: unknown maker ${m.makerId}`)
    if (m.jobs.length === 0) problems.push(`${m.id}: no job`)
    for (const j of m.jobs) if (!jobIds.has(j)) problems.push(`${m.id}: unknown job ${j}`)
    if (m.lines.length === 0) problems.push(`${m.id}: on no provider`)
    for (const l of m.lines) {
      const where = `${m.id} on ${l.provider}`
      if (!l.endpoint) problems.push(`${where}: no endpoint`)
      if (!jobIds.has(l.jobId)) problems.push(`${where}: unknown job ${l.jobId}`)
      if (Object.keys(l.params.properties).length === 0) problems.push(`${where}: no settings`)
      if (!((l.price.amount ?? 0) > 0) && !((l.price.computeSecond ?? 0) > 0) && !(l.price.amount === 0 && l.price.from === "api")) problems.push(`${where}: no price`)
      if (!l.price.readOn) problems.push(`${where}: price has no date`)
      const k = `${l.provider}|${l.jobId}`
      ranks.set(k, [...(ranks.get(k) ?? []), l.rank])
    }
  }
  // For each job on each provider the ranks run 1, 2, 3 ... with no gap and no repeat
  for (const [k, list] of ranks) {
    const sorted = [...list].sort((a, b) => a - b)
    if (sorted.some((r, i) => r !== i + 1)) problems.push(`${k}: ranks ${sorted.join(",")} are not 1..${sorted.length}`)
  }
  return problems
}
