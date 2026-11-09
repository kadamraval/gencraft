import type { ModelPrice, ModelRecord, AppCategory } from "../registry/types"
import type { KnowledgePack, PackLine, PackModel, PackPrice, PackTask } from "./schema"
import { tasksAndTools } from "./schema"
import makerList from "../sheet/makers.json"
import { simpleName, type SiblingFamily } from "../registry/simple-name"
import corrections from "../capability/corrections.json"

const NAME_FIXES: Record<string, string> = (corrections as { names?: Record<string, string> }).names ?? {}

const TOP_MAKERS = (makerList as { makers: Array<{ id: string; name: string }> }).makers
const OPEN_SOURCE = TOP_MAKERS.find((m) => m.id === "opensource")?.name ?? "Open source"

/**
 * The pack, as the registry's own records. The app keeps one shape for a model whatever its source, so the pickers, the price estimate,
 * the parameters form and the runners need no second path. What the pack adds is `serves`: the task and tool ids a model is for and
 * where it ranks for each on its provider, which the AI tools read instead of looking for words in a model's name.
 */

const SOURCE: Record<PackPrice["from"], ModelPrice["source"]> = { api: "api", standard: "api", page: "scraped", litellm: "curated", maker: "curated" }

function priceOf(p: PackPrice): ModelPrice {
  return { unit: p.unit, amount: p.amount, outputAmount: p.outputAmount, cachedAmount: p.cachedAmount, computeSecond: p.computeSecond, rules: p.rules, source: SOURCE[p.from], fetchedAt: p.readOn }
}

const KINDS = ["text", "image", "video", "audio"] as const
/** The categories the app's registry runs today (embedding models are not offered yet) */
const RUNS: ReadonlySet<string> = new Set<AppCategory>(["text", "image", "video", "audio"])

export function recordsFromPack(pack: KnowledgePack): ModelRecord[] {
  const entryById = new Map(tasksAndTools(pack).map((j) => [j.id, j]))
  const toolIds = new Set(pack.tools.map((t) => t.id))
  // Only the top makers (the maker list) are makers. A model by anyone else is shown under "Open source" when its weights are public,
  // and not shown at all otherwise; an uploader's account or a model's own slug is never a maker.
  const makerName = new Map(TOP_MAKERS.map((m) => [m.id, m.name]))
  const siblings = new Map<string, SiblingFamily[]>()
  for (const m of pack.models) if (m.family) siblings.set(m.makerId, [...(siblings.get(m.makerId) ?? []), { family: m.family, category: m.category }])
  const out = new Map<string, ModelRecord>()
  for (const model of pack.models) {
    if (!RUNS.has(model.category)) continue
    const maker = makerName.get(model.makerId) ?? (model.weights === "open" ? OPEN_SOURCE : undefined)
    if (!maker) continue
    const simple = model.category === "text" ? { name: model.name } : simpleName(model.name, model.family, model.category, siblings.get(model.makerId) ?? [], maker === OPEN_SOURCE ? model.name : maker)
    // The maker's own spelling for a few open-source names the providers write their own way (reviewed data, display only)
    const shown = { ...simple, name: NAME_FIXES[simple.name] ?? simple.name }
    for (const line of model.lines) {
      const id = `${line.provider}/${line.endpoint}`
      const existing = out.get(id)
      if (existing) {
        existing.serves = [...(existing.serves ?? []), { id: line.serves, rank: line.rank, role: line.role }]
        continue
      }
      out.set(id, recordOf(model, line, entryById.get(line.serves), toolIds.has(line.serves), maker, shown))
    }
  }
  return [...out.values()]
}

function recordOf(model: PackModel, line: PackLine, entry: PackTask | undefined, isTool: boolean, maker: string, shown: { name: string; variant?: string }): ModelRecord {
  const takes = (entry?.takesIn ?? "").toLowerCase()
  const inputs = KINDS.filter((k) => takes.includes(k) || Object.values(line.parameters.properties).some((p) => p.format === k))
  return {
    id: `${line.provider}/${line.endpoint}`,
    endpoint: line.endpoint,
    provider: line.provider,
    name: shown.name,
    ...(shown.variant ? { variant: shown.variant } : {}),
    ...(model.weights ? { weights: model.weights } : {}),
    family: model.id.split("/")[1] ?? model.name,
    versionId: model.id,
    ...(line.tier ? { tier: line.tier } : {}),
    logoKey: model.makerId,
    category: model.category as AppCategory,
    inputs: inputs.length > 0 ? (inputs as ModelRecord["inputs"]) : ["text"],
    params: line.parameters,
    price: priceOf(line.price),
    status: line.status,
    maker,
    task: entry?.providerTask,
    utility: isTool ? true : undefined,
    providerVersion: line.providerVersion,
    ...abilitiesOf(model),
    serves: [{ id: line.serves, rank: line.rank, role: line.role }],
  }
}

/** The maker's own abilities as the record's badges and tools flag (only what the maker states; nothing is guessed) */
function abilitiesOf(model: PackModel): Partial<ModelRecord> {
  const a = new Set(model.abilities ?? [])
  if (a.size === 0) return {}
  const summary: NonNullable<ModelRecord["summary"]> = {}
  if (a.has("vision")) summary.vision = true
  if (a.has("reasoning")) summary.reasoning = true
  if (a.has("web-search")) summary.webSearch = true
  if (a.has("audio-in")) summary.audioInput = true
  if (a.has("video-in")) summary.videoInput = true
  return { summary, ...(a.has("actions") ? { tools: true } : {}) }
}
