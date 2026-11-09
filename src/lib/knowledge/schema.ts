import type { Category, ParamSchema, PriceRule, PriceUnit } from "../registry/types"

/**
 * The standard model database. It is the set of sheets we agreed (Makers, Models, Tasks, Tools, Capabilities, Parameters, Providers,
 * Provider lines, Sources, Gaps, Completeness; Safety comes later) written as one JSON pack. The build makes it from named sources; the app
 * reads nothing else for what a model can do, which parameters it takes, what it costs and where it runs. The words are defined in
 * docs/terms.md.
 *
 * Two rules hold everywhere: a value either comes from a source (kept on the line with its address and date) or it is absent and listed
 * in `gaps`; and a model is published only when its lines are complete (see `validatePack`).
 */

export const PACK_SCHEMA_VERSION = 2

/** What a model makes */
export type PackCategory = Category

/** Where in the app a task or tool is used */
export type UsedIn = "create" | "audio" | "edit" | "story" | "agent" | "library"

/** The providers a line can be on */
export type Provider = "fal" | "replicate" | "openrouter" | "openai" | "gemini"

/** How a fact reached the database, in the order they are tried */
export type FactFrom = "standard" | "litellm" | "api" | "page" | "maker"

/** A task (makes something: text-to-video) or a tool (changes a file you have: video-upscale). Tasks and tools are two separate lists. */
export interface PackTask {
  /** The id the code uses: text-to-video, video-upscale */
  id: string
  name: string
  category: PackCategory
  /** The name providers file such models under (text-to-speech, video-to-video), used only to read providers */
  providerTask: string
  takesIn: string
  mayTake: string | null
  gives: string
  alsoKnownAs: string[]
  usedIn: UsedIn[]
}
export type PackTool = PackTask

/** What a model can take in. Parameters (settings) are kept apart, on each line. */
export type CapabilityId = "start-image" | "end-image" | "reference-images" | "reference-videos" | "reference-audio" | "elements" | "source-video" | "source-audio"

export interface PackCapability {
  id: CapabilityId
  /** How many files it takes, when a provider states it */
  max?: number
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

/** One model on one provider, serving one task or tool */
export interface PackLine {
  provider: Provider
  endpoint: string
  /** The task or tool id this line is for */
  serves: string
  /** 1 is the first choice for this task or tool on this provider; 2 and up are its backups */
  rank: number
  /** model: the maker's own. substitute: the provider's own newest. alternative: a model that follows instructions and does it by being told to. */
  role: "model" | "substitute" | "alternative"
  price: PackPrice
  /** The parameters, in the registry's shape, with the provider's own field names */
  parameters: ParamSchema
  /** A quality tier of the model on this endpoint (standard, pro, 4k): a setting of the model, not another model */
  tier?: string
  /** The provider's own field name for each capability this line takes */
  fields?: Partial<Record<CapabilityId, string>>
  status: "active" | "preview" | "deprecated"
  /** Providers' own names for the task or tool that confirmed it */
  seenBy: string[]
  /** A second source differs by more than 10 percent */
  conflict?: boolean
  /** The provider's own version id, for providers that run a version (Replicate) */
  providerVersion?: string
}

export interface PackModel {
  /** Canonical: maker/model, the same on every provider */
  id: string
  makerId: string
  name: string
  /** The maker family it belongs to ("Kling"), as the maker list names it */
  family?: string
  version?: string
  category: PackCategory
  /** Tasks this model does */
  tasks: string[]
  /** Tools this model does */
  tools: string[]
  /** What it takes in, the same on every provider */
  capabilities: PackCapability[]
  /** What its maker's own LiteLLM entry says it can do: vision, actions (calls tools), reasoning, web-search, pdf, audio-in, video-in, structured, edit */
  abilities?: string[]
  /** Whether its weights are public, when a source says so (the leaderboard, its maker) */
  weights?: "open" | "closed"
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
  /** grid: a task or tool on a provider with no closed or no open model and no alternative */
  field: "serves" | "parameters" | "price" | "endpoint" | "backups" | "grid"
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
  tasks: PackTask[]
  tools: PackTool[]
  models: PackModel[]
  sources: PackSource[]
  gaps: PackGap[]
  completeness: PackCompleteness[]
  /** Newer versions of a maker's family than the maker list names, found in a provider's own list and added automatically */
  newVersions?: Array<{ declared: string; found: string; provider: Provider; endpoint: string }>
  /** Set by the publisher; the app refuses a pack whose signature does not verify */
  signature?: string
}

/** Every task and tool of a pack, for code that looks either up by id */
export const tasksAndTools = (pack: Pick<KnowledgePack, "tasks" | "tools">): PackTask[] => [...pack.tasks, ...pack.tools]

/**
 * The reasons a pack cannot be published or loaded. An empty list means every model in it is complete: a task or tool it does, parameters,
 * a price (or a stated reason there is none) and an endpoint on every line, with rank 1 present for each task or tool on each provider.
 */
export function validatePack(pack: KnowledgePack): string[] {
  const problems: string[] = []
  if (pack.schemaVersion !== PACK_SCHEMA_VERSION) problems.push(`schemaVersion ${pack.schemaVersion} is not ${PACK_SCHEMA_VERSION}`)
  if (!Array.isArray(pack.tasks) || !Array.isArray(pack.tools)) {
    problems.push("no tasks or tools list")
    return problems
  }
  const taskIds = new Set(pack.tasks.map((t) => t.id))
  const toolIds = new Set(pack.tools.map((t) => t.id))
  for (const id of taskIds) if (toolIds.has(id)) problems.push(`${id}: is both a task and a tool`)
  const makerIds = new Set(pack.makers.map((m) => m.id))
  const seen = new Set<string>()
  const ranks = new Map<string, number[]>()
  for (const m of pack.models) {
    if (seen.has(m.id)) problems.push(`${m.id}: listed twice`)
    seen.add(m.id)
    if (!makerIds.has(m.makerId)) problems.push(`${m.id}: unknown maker ${m.makerId}`)
    if (m.tasks.length + m.tools.length === 0) problems.push(`${m.id}: no task or tool`)
    for (const t of m.tasks) if (!taskIds.has(t)) problems.push(`${m.id}: unknown task ${t}`)
    for (const t of m.tools) if (!toolIds.has(t)) problems.push(`${m.id}: unknown tool ${t}`)
    if (m.lines.length === 0) problems.push(`${m.id}: on no provider`)
    for (const l of m.lines) {
      const where = `${m.id} on ${l.provider}`
      if (!l.endpoint) problems.push(`${where}: no endpoint`)
      if (!taskIds.has(l.serves) && !toolIds.has(l.serves)) problems.push(`${where}: serves unknown ${l.serves}`)
      // Each fact is stored once: the model's lists and its lines say the same
      else if (!m.tasks.includes(l.serves) && !m.tools.includes(l.serves)) problems.push(`${where}: serves ${l.serves}, which the model does not list`)
      if (Object.keys(l.parameters.properties).length === 0) problems.push(`${where}: no parameters`)
      if (!((l.price.amount ?? 0) > 0) && !((l.price.computeSecond ?? 0) > 0) && !(l.price.amount === 0 && l.price.from === "api")) problems.push(`${where}: no price`)
      if (!l.price.readOn) problems.push(`${where}: price has no date`)
      const k = `${l.provider}|${l.serves}`
      ranks.set(k, [...(ranks.get(k) ?? []), l.rank])
    }
    for (const t of [...m.tasks, ...m.tools]) if (!m.lines.some((l) => l.serves === t)) problems.push(`${m.id}: lists ${t} but no line serves it`)
  }
  // For each task or tool on each provider the ranks run 1, 2, 3 ... with no gap and no repeat
  for (const [k, list] of ranks) {
    const sorted = [...list].sort((a, b) => a - b)
    if (sorted.some((r, i) => r !== i + 1)) problems.push(`${k}: ranks ${sorted.join(",")} are not 1..${sorted.length}`)
  }
  return problems
}
