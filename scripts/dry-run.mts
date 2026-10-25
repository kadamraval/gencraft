/**
 * Builds the request for every current model without sending anything, and reports which ones the app cannot
 * fully fill in: a prompt field it does not know, a required setting with no default, or a required file the
 * composer cannot supply. It proves the plumbing for the whole catalog without spending money.
 *
 *   npm run dry-run
 */
import snapshot from "../src/lib/registry/registry.snapshot.json" with { type: "json" }
import { isListed } from "../src/lib/registry/lifecycle.ts"
import { buildInput } from "../src/lib/registry/request.ts"
import { refCapability } from "../src/lib/registry/slots.ts"
import type { ModelRecord } from "../src/lib/registry/types.ts"

const models = (snapshot as unknown as { models: ModelRecord[] }).models.filter((r) => ["fal", "replicate"].includes(r.provider) && isListed(r))

const defaults = (r: ModelRecord): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [k, p] of Object.entries(r.params.properties)) {
    if (p.format) continue
    if (p.default !== undefined) out[k] = p.default
    else if (p.enum?.length) out[k] = p.enum[0]
  }
  return out
}

const stats = new Map<string, { total: number; ok: number; noSpec: number; blocked: number }>()
const blockerCount = new Map<string, number>()
const promptKeys = new Map<string, number>()
const needsFile: Record<string, number> = {}
const examples: string[] = []

for (const r of models) {
  const key = `${r.provider}/${r.modality}`
  const s = stats.get(key) ?? { total: 0, ok: 0, noSpec: 0, blocked: 0 }
  s.total++
  stats.set(key, s)
  const spec = r.params.request
  if (!spec) {
    s.noSpec++
    continue
  }
  promptKeys.set(spec.promptKey, (promptKeys.get(spec.promptKey) ?? 0) + 1)
  const input = buildInput(r, "a test prompt", defaults(r))
  const cap = refCapability(r)
  const fileNeeds = cap.needs.filter((n) => n === "video" || n === "audio")
  for (const n of fileNeeds) needsFile[n] = (needsFile[n] ?? 0) + 1
  if (!(spec.promptKey in input) || spec.blockers.length > 0) {
    s.blocked++
    for (const b of spec.blockers) blockerCount.set(b, (blockerCount.get(b) ?? 0) + 1)
    if (examples.length < 12) examples.push(`${r.id}: ${spec.blockers.join(", ")}`)
  } else s.ok++
}

console.log("Request check, no network:")
for (const [k, s] of [...stats.entries()].sort()) console.log(`  ${k.padEnd(18)} ${String(s.total).padStart(4)} models  ${String(s.ok).padStart(4)} complete  ${String(s.blocked).padStart(4)} blocked  ${String(s.noSpec).padStart(4)} not read yet`)
console.log("Prompt field used:", [...promptKeys.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "))
console.log("Required fields we cannot fill:", [...blockerCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k} ${v}`).join(", ") || "none")
console.log("Required video or audio input:", JSON.stringify(needsFile))
if (examples.length) console.log("Examples:\n  " + examples.join("\n  "))
