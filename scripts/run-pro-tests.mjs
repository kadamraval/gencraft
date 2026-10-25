// Runs the tests that need the paid-only code (src/pro: the Agent and the App builder). The public source has neither the code nor these tests, so there
// the script finds nothing to run and succeeds.
import { existsSync, readdirSync } from "node:fs"
import { spawnSync } from "node:child_process"

if (!existsSync("src/pro") || !existsSync("scripts/pro")) {
  console.log("No src/pro or scripts/pro here: nothing to run (community source).")
  process.exit(0)
}
let failed = 0
for (const file of readdirSync("scripts/pro").filter((f) => f.endsWith(".mts")).sort()) {
  const run = spawnSync("npx", ["tsx", `scripts/pro/${file}`], { stdio: "inherit", shell: true })
  if (run.status !== 0) failed++
}
process.exit(failed ? 1 : 0)
