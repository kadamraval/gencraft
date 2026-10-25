/**
 * Compares the makers' profiles with what the hosts list now, and says what needs a fresh look at the maker's page.
 *
 *   npm run models:check            report
 *   npm run models:check -- --strict  also fail when a profile matches no model (a rename or a removal)
 *
 * Reported:
 *   - a profile that matches no model on any host
 *   - a profile whose file limits differ from what a host lists (the maker may have changed its page, or the host differs)
 *   - a top model (on the leaderboard shortlist) that has no profile yet
 *   - a profile source older than 90 days
 */
import "../src/lib/models/profiles"
import { allProfiles, profileFor } from "../src/lib/models/profile"
import { shortlistRank } from "../src/lib/registry/shortlist"
import snapshot from "../src/lib/registry/registry.snapshot.json" with { type: "json" }
import type { ModelRecord } from "../src/lib/registry/types"

const strict = process.argv.includes("--strict")
const models = (snapshot as { models: ModelRecord[] }).models
const today = new Date("2026-10-13")
let problems = 0
const say = (kind: "warn" | "info", text: string) => console.log(`${kind === "warn" ? "WARN" : "info"}  ${text}`)

for (const profile of allProfiles()) {
  const matched = models.filter((m) => profileFor(m)?.id === profile.id)
  if (matched.length === 0) {
    say("warn", `${profile.id}: matches no model on any host (renamed or removed?)`)
    problems++
    continue
  }
  say("info", `${profile.id}: ${matched.length} model(s) — ${[...new Set(matched.map((m) => m.provider))].join(", ")}`)

  // File limits against what a host lists
  const limits = profile.inputs
  if (limits?.images) {
    const hostMax = Math.max(0, ...matched.map((m) => m.summary?.refs?.images ?? 0))
    if (hostMax > 0 && hostMax !== limits.images.max) say("warn", `${profile.id}: the maker says ${limits.images.max} pictures, a host lists ${hostMax}`)
  }

  for (const s of profile.sources) {
    const age = Math.round((today.getTime() - new Date(s.read).getTime()) / 86400000)
    if (age > 90) {
      say("warn", `${profile.id}: ${s.url} was read ${age} days ago`)
      problems++
    }
  }
}

// Top models with no profile
const missing = new Map<string, number>()
for (const m of models) {
  const rank = shortlistRank(m)
  if (rank === undefined || profileFor(m)) continue
  const key = `${m.modality}: ${m.name.replace(/ (Text|Image|Reference|Video|Edit|First).*$/i, "")}`
  missing.set(key, Math.min(rank, missing.get(key) ?? 999))
}
for (const [name, rank] of [...missing].sort((a, b) => a[1] - b[1]).slice(0, 25)) say("info", `no profile yet: ${name} (board rank ${rank})`)

console.log(`\n${allProfiles().length} profiles, ${missing.size} top models without one, ${problems} to look at`)
process.exit(strict && problems > 0 ? 1 : 0)
