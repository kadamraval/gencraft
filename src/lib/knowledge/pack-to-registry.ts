import type { ModelPrice, ModelRecord } from "../registry/types"
import type { KnowledgePack, PackLine, PackModel, PackPrice } from "./schema"

/**
 * The pack, as the registry's own records. The app keeps one shape for a model whatever its source, so the pickers, the price estimate,
 * the settings form and the runners need no second path. What the pack adds is `jobs`: the job ids a model does and where it ranks for
 * each on its provider, which the AI tools read instead of looking for words in a model's name.
 */

const SOURCE: Record<PackPrice["from"], ModelPrice["source"]> = { api: "api", standard: "api", page: "scraped", litellm: "curated", maker: "curated" }

function priceOf(p: PackPrice): ModelPrice {
  return { unit: p.unit, amount: p.amount, outputAmount: p.outputAmount, cachedAmount: p.cachedAmount, computeSecond: p.computeSecond, rules: p.rules, source: SOURCE[p.from], fetchedAt: p.readOn }
}

const KINDS = ["text", "image", "video", "audio"] as const

export function recordsFromPack(pack: KnowledgePack): ModelRecord[] {
  const jobById = new Map(pack.jobs.map((j) => [j.id, j]))
  const makerName = new Map(pack.makers.map((m) => [m.id, m.name]))
  const out = new Map<string, ModelRecord>()
  for (const model of pack.models) {
    for (const line of model.lines) {
      const id = `${line.provider}/${line.endpoint}`
      const job = jobById.get(line.jobId)
      const existing = out.get(id)
      if (existing) {
        existing.jobs = [...(existing.jobs ?? []), { id: line.jobId, rank: line.rank, role: line.role }]
        continue
      }
      out.set(id, recordOf(model, line, job, makerName.get(model.makerId)))
    }
  }
  return [...out.values()]
}

function recordOf(model: PackModel, line: PackLine, job: ReturnType<Map<string, KnowledgePack["jobs"][number]>["get"]>, maker: string | undefined): ModelRecord {
  const takes = (job?.takesIn ?? "").toLowerCase()
  const inputs = KINDS.filter((k) => takes.includes(k) || Object.values(line.params.properties).some((p) => p.format === k))
  return {
    id: `${line.provider}/${line.endpoint}`,
    endpoint: line.endpoint,
    provider: line.provider,
    name: model.name,
    family: model.id.split("/")[1] ?? model.name,
    logoKey: model.makerId,
    modality: model.type,
    inputs: inputs.length > 0 ? (inputs as ModelRecord["inputs"]) : ["text"],
    params: line.params,
    price: priceOf(line.price),
    status: line.status,
    maker,
    task: job?.category,
    utility: job?.kind === "tool" ? true : undefined,
    providerVersion: line.providerVersion,
    jobs: [{ id: line.jobId, rank: line.rank, role: line.role }],
  }
}
