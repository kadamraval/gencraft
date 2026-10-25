/**
 * Builds the shortlist of the best models per kind of output from public arena leaderboards.
 *
 *   npm run shortlist:build
 *
 * One board per kind of output (Artificial Analysis: text to image, text to video, text to speech). Each row gives the
 * model, its maker, its Elo from blind votes, and, for a model with public weights, the Hugging Face repository. The
 * licence of that repository is read from Hugging Face. Whether a model is open is for the app's own use only.
 *
 * A board that cannot be read, or that comes back with far fewer rows than before, keeps its previous rows: the build
 * never replaces good data with less.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseLeaderboard } from "../src/lib/registry/shortlist.ts"
import type { Shortlist, ShortlistEntry } from "../src/lib/registry/shortlist.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.resolve(here, "../src/lib/registry/shortlist.generated.json")

const BOARDS: Array<{ modality: ShortlistEntry["modality"]; url: string }> = [
  { modality: "image", url: "https://artificialanalysis.ai/text-to-image/arena/leaderboard-text" },
  { modality: "video", url: "https://artificialanalysis.ai/video/leaderboard/text-to-video" },
  { modality: "audio", url: "https://artificialanalysis.ai/text-to-speech/leaderboard" },
]

/** Rows kept per board. The registry matches by name, so a few more than will ever be shown is enough. */
const KEEP = 60
/** A board with fewer rows than this is taken as a broken page, not a short board */
const MIN_ROWS = 10

const previous: Shortlist = fs.existsSync(out) ? (JSON.parse(fs.readFileSync(out, "utf8")) as Shortlist) : { builtAt: "", entries: [] }

async function licenseOf(repo: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://huggingface.co/api/models/${repo}`, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return undefined
    const json = (await res.json()) as { cardData?: { license?: string }; tags?: string[] }
    return json.cardData?.license ?? json.tags?.find((t) => t.startsWith("license:"))?.slice("license:".length)
  } catch {
    return undefined
  }
}

const entries: ShortlistEntry[] = []
for (const board of BOARDS) {
  let rows: Awaited<ReturnType<typeof parseLeaderboard>> = []
  try {
    const res = await fetch(board.url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    rows = parseLeaderboard(await res.text())
  } catch (e) {
    console.log(`${board.modality}: could not read the board (${e instanceof Error ? e.message : String(e)})`)
  }
  if (rows.length < MIN_ROWS) {
    const old = previous.entries.filter((e) => e.modality === board.modality)
    console.log(`${board.modality}: ${rows.length} rows is too few, keeping the ${old.length} from the last build`)
    entries.push(...old)
    continue
  }
  const licences = new Map<string, string | undefined>()
  const top = rows.slice(0, KEEP)
  await Promise.all([...new Set(top.map((r) => r.weights).filter((w): w is string => Boolean(w)))].map(async (repo) => licences.set(repo, await licenseOf(repo))))
  top.forEach((r, i) =>
    entries.push({
      modality: board.modality,
      rank: i + 1,
      name: r.name,
      maker: r.creator ?? "",
      elo: r.elo,
      open: Boolean(r.weights),
      ...(r.weights ? { weights: r.weights, ...(licences.get(r.weights) ? { license: licences.get(r.weights) } : {}) } : {}),
    }),
  )
  console.log(`${board.modality}: ${top.length} models, ${top.filter((r) => r.weights).length} with public weights`)
}

fs.writeFileSync(out, JSON.stringify({ builtAt: new Date().toISOString(), entries } satisfies Shortlist, null, 1))
console.log(`wrote ${entries.length} entries`)
