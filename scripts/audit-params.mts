/**
 * Checks every saved model's parameters the way the composer will use them, and fails (exit 1) on anything that
 * would put a wrong value in a request, a price or the screen. Run by `npm run test:registry` and after every
 * `npm run registry:build`, so a gap shows up the day it appears instead of the day someone hits it.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { aspectOf, clampToSchema, countOf, defaultsFor, megapixelsOf, secondsOf } from "../src/lib/registry/param-logic"
import type { ModelRecord } from "../src/lib/registry/types"

const here = path.dirname(fileURLToPath(import.meta.url))
const snapshot = JSON.parse(fs.readFileSync(path.resolve(here, "../src/lib/registry/registry.snapshot.json"), "utf8")) as { models: ModelRecord[] }
const errors: string[] = []
const add = (m: ModelRecord, text: string) => errors.push(`${m.id}: ${text}`)

for (const m of snapshot.models) {
  const props = m.params.properties
  const defaults = defaultsFor(m.params)

  for (const [key, p] of Object.entries(props)) {
    if (p.format) continue
    const v = defaults[key]
    if (p.enum?.length && v !== undefined && !p.enum.includes(v as string | number)) add(m, `${key}: default is not one of the choices`)
    if (typeof v === "object" && v !== null) add(m, `${key}: default is an object`)
    if (typeof v === "number" && ((p.minimum !== undefined && v < p.minimum) || (p.maximum !== undefined && v > p.maximum))) add(m, `${key}: default is outside its range`)
  }

  // Choosing again after switching to this model must keep the defaults as they are
  const again = clampToSchema(m.params, defaults)
  for (const k of Object.keys(defaults)) if (again[k] !== defaults[k]) add(m, `${k}: a default does not survive being kept`)

  // Every choice must read as something the run, the price and the card can use
  for (const [key, p] of Object.entries(props)) {
    for (const opt of p.enum ?? []) {
      if (/^(duration|duration_seconds|seconds)$/.test(key) && !Number.isFinite(secondsOf({ [key]: opt }))) add(m, `${key}=${opt} does not give a number of seconds`)
      if (/^(aspect_ratio|image_size|video_size|ratio)$/.test(key) && !aspectOf({ [key]: opt })) add(m, `${key}=${opt} does not give a shape`)
      if (/^(resolution|image_size|size|quality)$/.test(key) && !(megapixelsOf({ [key]: opt }) > 0)) add(m, `${key}=${opt} does not give a size`)
    }
  }
  if (!(countOf(defaults) >= 1)) add(m, "the image count does not read as 1 or more")
}

// Fields nobody has placed yet (kept under More, but they should get a proper tier)
const reportFile = path.resolve(here, "registry-report.txt")
const report = fs.existsSync(reportFile) ? fs.readFileSync(reportFile, "utf8") : ""
const waiting = report.split("Fields never classified")[1]?.split("\n").filter((l) => /^\s+\d+\s+\S+$/.test(l)) ?? []

console.log(`checked ${snapshot.models.length} models`)
if (waiting.length) console.log(`note: ${waiting.length} field name(s) still unclassified (shown under More until placed):\n${waiting.slice(0, 10).join("\n")}`)
if (errors.length) {
  console.log(`\n${errors.length} problem(s):\n${errors.slice(0, 40).join("\n")}`)
  process.exit(1)
}
console.log("every model's parameters are usable as they are")
