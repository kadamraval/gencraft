import { writeFileSync } from "node:fs"
import packJson from "../src/lib/knowledge/pack.json" with { type: "json" }
import { recordsFromPack } from "../src/lib/knowledge/pack-to-registry.ts"
import type { KnowledgePack } from "../src/lib/knowledge/schema.ts"
import { CATALOG } from "../src/lib/ai-tools/catalog.ts"
import { statusOf, wantOf } from "../src/lib/ai-tools/match.ts"
import { capabilityOfExact } from "../src/lib/capability/index.ts"

/**
 * What the one rule finds in the standard database: for every Edit option and provider, how many models fit, and the readings that look
 * wrong. A gap here is a reader to fix (the maker's model is on every provider), never a limit to accept. Writes docs/capability-report.md.
 */

const pool = recordsFromPack(packJson as unknown as KnowledgePack)
const PROVIDERS = ["fal", "replicate", "openrouter"] as const
const lines: string[] = ["# Capability report", "", `Read from the standard database (${pool.length} endpoints). Made by \`npx tsx scripts/capability-report.mts\`.`, ""]

lines.push("## Edit options: models that fit, per provider", "", "| Option | fal | Replicate | OpenRouter |", "|---|---|---|---|")
const gaps: string[] = []
for (const spec of CATALOG) {
  const want = wantOf(spec)
  if (!want) continue
  // Exactly what the app offers on that provider: the one rule, plus the closest-job stand-in it uses when nothing does the job itself
  const cells = PROVIDERS.map((p) => {
    const list = statusOf(spec, { records: pool, listed: pool, keyed: new Set([p]), runnable: () => true }).candidates
    if (list.length === 0) gaps.push(`- ${spec.name} (${spec.group}) on ${p}: no model read`)
    return list.length === 0 ? "**0**" : `${list.length} (${list[0]!.name})`
  })
  lines.push(`| ${spec.name} (${spec.group}) | ${cells.join(" | ")} |`)
}

lines.push("", "## Gaps to look into", "", "Each is checked against the provider's own list: either our reader misses the model, or the maker's model is not offered there.", "", ...(gaps.length ? gaps : ["None."]))

const odd: string[] = []
for (const r of pool) {
  const c = capabilityOfExact(r)
  const fields = Object.entries(r.params.properties)
  if (r.category === "image" && fields.some(([, p]) => p.slot && p.slot.kind !== "image")) odd.push(`- ${r.id}: a picture model with a clip or sound field (ignored)`)
  if (c.does.includes("edit") && !c.takes.some((t) => t.role === "source")) odd.push(`- ${r.id}: edits but no field for the file it changes`)
  if (c.does.length === 0) odd.push(`- ${r.id}: nothing it does was read`)
}
lines.push("", "## Readings that look wrong", "", ...(odd.length ? odd : ["None."]), "")

writeFileSync("docs/capability-report.md", lines.join("\n"))
console.log(`docs/capability-report.md: ${gaps.length} gaps, ${odd.length} odd readings`)
