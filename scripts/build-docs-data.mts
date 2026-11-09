/**
 * Writes the "Models and prices" pages and the changelog page of the docs site from the data, so they are never typed by hand.
 *
 *   npx tsx scripts/build-docs-data.mts [pack file or address]
 *
 * Reads the model database (default src/lib/knowledge/pack.json; the docs workflow passes the published copy) and CHANGELOG.md, and writes into
 * docs-site/src/content/docs/: models/index.md, models/providers.md, models/tasks-and-tools.md, models/prices.md and changelog.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"

interface Price {
  unit: string
  amount: number | null
  outputAmount?: number
  computeSecond?: number
}
interface Line {
  provider: string
  endpoint: string
  serves: string
  rank: number
  role: string
  price: Price
}
interface Model {
  id: string
  makerId: string
  name: string
  version?: string
  category: string
  tasks: string[]
  tools: string[]
  lines: Line[]
}
interface Entry {
  id: string
  name: string
  category: string
  takesIn: string
  gives: string
}
interface Pack {
  generatedAt: string
  makers: Array<{ id: string; name: string }>
  tasks: Entry[]
  tools: Entry[]
  models: Model[]
  gaps: Array<{ field: string }>
}

const source = process.argv[2] ?? "src/lib/knowledge/pack.json"
const raw = /^https?:/.test(source) ? await (await fetch(source)).text() : readFileSync(source, "utf8")
const pack = JSON.parse(raw) as Pack
const out = "docs-site/src/content/docs"
mkdirSync(`${out}/models`, { recursive: true })

const PROVIDERS: Array<[string, string]> = [["fal", "fal"], ["replicate", "Replicate"], ["openrouter", "OpenRouter"], ["openai", "OpenAI"], ["gemini", "Gemini"]]
const providerName = (p: string) => PROVIDERS.find(([id]) => id === p)?.[1] ?? p
const makerName = new Map(pack.makers.map((m) => [m.id, m.name]))

const UNIT: Record<string, string> = {
  per_image: "per image",
  per_second: "per second",
  per_run: "per run",
  per_1m_tokens: "per 1M tokens",
  per_megapixel: "per megapixel",
  per_1k_chars: "per 1,000 characters",
  per_minute: "per minute",
  per_megapixel_second: "per megapixel second",
  per_frame: "per frame",
  unknown: "",
}
const usd = (n: number) => `$${n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(3) : n.toPrecision(2).replace(/\.?0+$/, "")}`
function priceText(p: Price): string {
  if (p.amount !== null && p.amount > 0) {
    const base = `${usd(p.amount)} ${UNIT[p.unit] ?? ""}`.trim()
    return p.outputAmount ? `${base} in, ${usd(p.outputAmount)} out` : base
  }
  if (p.amount === 0) return "free"
  if ((p.computeSecond ?? 0) > 0) return `${usd(p.computeSecond!)} per compute second`
  return "see provider"
}
const esc = (s: string) => s.replace(/\|/g, "\\|")
const date = pack.generatedAt.slice(0, 10)
const head = (title: string, description: string) => `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\n---\n\n`

const lines = pack.models.flatMap((m) => m.lines.map((l) => ({ m, l })))
const entryById = new Map([...pack.tasks, ...pack.tools].map((j) => [j.id, j]))

// ---- overview
const overview = [
  head("Models and prices", "The models Gencraft knows on fal, Replicate, OpenRouter, OpenAI and Gemini: what each can do, the parameters it takes and what it costs."),
  `These pages are made automatically from Gencraft's model database, which is rebuilt every day from the providers' own lists. This copy is from **${date}**.`,
  "",
  `- **${pack.models.length} models** from ${pack.makers.length} makers, on **${lines.length} provider lines**, doing **${pack.tasks.length} tasks** and **${pack.tools.length} tools**.`,
  "- [Providers](providers/): what each provider brings.",
  "- [Tasks and tools](tasks-and-tools/): for each task and tool, the best models on every provider, first choice first.",
  "- [Prices](prices/): every model with the tasks and tools it does, where it runs and what it costs.",
  "",
  "Prices are what the provider states and may change; Gencraft shows an estimate before every run and learns the real cost after it. Where a provider has no model for a task or tool, the app says so and names what to add.",
  "",
].join("\n")
writeFileSync(`${out}/models/index.md`, overview)

// ---- providers
const prov: string[] = [head("Providers", "What each provider brings to Gencraft: how many models and which tasks and tools."), `From the model database of ${date}.`, ""]
prov.push("| Provider | Models | Provider lines | Tasks and tools covered |", "|---|---|---|---|")
for (const [id, name] of PROVIDERS) {
  const ls = lines.filter((x) => x.l.provider === id)
  prov.push(`| ${name} | ${new Set(ls.map((x) => x.m.id)).size} | ${ls.length} | ${new Set(ls.map((x) => x.l.serves)).size} |`)
}
prov.push("")
for (const [id, name] of PROVIDERS) {
  const ls = lines.filter((x) => x.l.provider === id)
  prov.push(`## ${name}`, "")
  const byServes = new Map<string, number>()
  for (const x of ls) byServes.set(x.l.serves, (byServes.get(x.l.serves) ?? 0) + 1)
  const rows = [...byServes.entries()].sort((a, b) => b[1] - a[1])
  prov.push("| Task or tool | Models |", "|---|---|", ...rows.map(([j, n]) => `| ${entryById.get(j)?.name ?? j} | ${n} |`), "")
}
writeFileSync(`${out}/models/providers.md`, prov.join("\n"))

// ---- tasks and tools
const servesPage: string[] = [head("Tasks and tools", "For each task and tool Gencraft offers, the best models on every provider, first choice first."), `A task makes something, such as an image from text. A tool changes a file you already have, such as upscaling a video. From the model database of ${date}.`, ""]
const groups: Array<[Entry[], string]> = [[pack.tasks, "Tasks: making things from a prompt"], [pack.tools, "Tools: for a file you already have"]]
for (const [list, title] of groups) {
  servesPage.push(`## ${title}`, "")
  for (const entry of list) {
    const ls = lines.filter((x) => x.l.serves === entry.id)
    if (ls.length === 0) continue
    servesPage.push(`### ${entry.name}`, "", `Takes ${entry.takesIn}, gives ${entry.gives}.`, "", "| Provider | Rank | Model | Price |", "|---|---|---|---|")
    for (const [pid, pname] of PROVIDERS) {
      for (const x of ls.filter((y) => y.l.provider === pid).sort((a, b) => a.l.rank - b.l.rank)) servesPage.push(`| ${pname} | ${x.l.rank} | ${esc(x.m.name)} | ${priceText(x.l.price)} |`)
    }
    servesPage.push("")
  }
}
writeFileSync(`${out}/models/tasks-and-tools.md`, servesPage.join("\n"))

// ---- prices
const rows = pack.models
  .map((m) => {
    const where = [...new Set(m.lines.map((l) => providerName(l.provider)))].join(", ")
    const cheapest = m.lines.map((l) => ({ l, v: l.price.amount ?? Infinity })).sort((a, b) => a.v - b.v)[0]?.l
    const does = [...m.tasks, ...m.tools].map((j) => entryById.get(j)?.name ?? j).join(", ")
    return `| ${esc(m.name)} | ${esc(makerName.get(m.makerId) ?? m.makerId)} | ${esc(does)} | ${where} | ${cheapest ? priceText(cheapest.price) : ""} |`
  })
  .sort()
writeFileSync(
  `${out}/models/prices.md`,
  [head("Prices", "Every model Gencraft knows with the tasks and tools it does, where it runs and what it costs."), `The price shown is the lowest across providers for that model. From the model database of ${date}.`, "", "| Model | Maker | Tasks and tools | Providers | From |", "|---|---|---|---|---|", ...rows, ""].join("\n"),
)

// ---- changelog
if (existsSync("CHANGELOG.md")) {
  const text = readFileSync("CHANGELOG.md", "utf8").replace(/^# Changelog\s*/, "")
  writeFileSync(`${out}/changelog.md`, head("Changelog", "What changed in each release of Gencraft.") + text)
}
console.log(`docs data: ${pack.models.length} models, ${lines.length} lines (${date})`)
