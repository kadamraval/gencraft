import * as React from "react"
import { getKnowledgePack } from "@/lib/knowledge/store"
import { getProviderApiKey } from "@/lib/providers/live-connectors"
import type { ProviderId } from "@/lib/registry/providers"
import type { SettingsState } from "@/types"

/**
 * Library search by meaning: "beach at sunset" finds a clip whose prompt says "golden hour on the coast". Each file's title and prompt are
 * turned into numbers (an embedding) once, kept on this device, and compared with the search words. The embedding model is the newest one
 * the standard database lists on a provider the person has a key for; without one, the Library searches by words as before.
 */

const DIMENSIONS = 256
const STORE = "gencraft_meaning_v1"

interface Embedder {
  provider: "openrouter" | "fal" | "openai" | "gemini"
  model: string
  key: string
}

/** The embedding model to use: OpenRouter and fal run every listed one; OpenAI and Google run their own */
function embedderFor(settings: SettingsState): Embedder | undefined {
  const pack = getKnowledgePack()
  const models = pack.models.filter((m) => m.category === "embedding" && m.status !== "deprecated")
  const keyOf = (p: ProviderId) => getProviderApiKey(p, settings)
  for (const provider of ["openrouter", "fal"] as const) {
    if (!keyOf(provider)) continue
    // The database lists each provider's lines best first (rank 1)
    const line = models.flatMap((m) => m.lines.filter((l) => l.provider === provider)).sort((x, y) => x.rank - y.rank)[0]
    if (line) return { provider, model: line.endpoint, key: keyOf(provider) }
  }
  // A maker's own key runs the maker's own embedding model, named as the database names it
  for (const [provider, maker] of [["openai", "openai"], ["gemini", "google"]] as const) {
    if (!keyOf(provider)) continue
    const line = models.filter((m) => m.makerId === maker).flatMap((m) => m.lines)[0]
    if (line) return { provider, model: line.endpoint.split("/").pop()!, key: keyOf(provider) }
  }
  return undefined
}

async function embed(e: Embedder, texts: string[]): Promise<number[][]> {
  if (e.provider === "gemini") {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${e.model}:batchEmbedContents?key=${encodeURIComponent(e.key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: texts.map((t) => ({ model: `models/${e.model}`, content: { parts: [{ text: t }] }, outputDimensionality: DIMENSIONS })) }),
    })
    if (!res.ok) throw new Error(`Search by meaning: HTTP ${res.status}`)
    const json = (await res.json()) as { embeddings?: Array<{ values: number[] }> }
    return (json.embeddings ?? []).map((x) => x.values)
  }
  const base = e.provider === "openai" ? "https://api.openai.com/v1" : e.provider === "fal" ? "https://fal.run/openrouter/router/openai/v1" : "https://openrouter.ai/api/v1"
  const auth = e.provider === "fal" ? `Key ${e.key}` : `Bearer ${e.key}`
  const res = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", "X-Title": "Gencraft" },
    body: JSON.stringify({ model: e.model, input: texts, dimensions: DIMENSIONS }),
  })
  if (!res.ok) throw new Error(`Search by meaning: HTTP ${res.status}`)
  const json = (await res.json()) as { data?: Array<{ embedding: number[] }> }
  return (json.data ?? []).map((x) => x.embedding)
}

const norm = (v: number[]) => {
  const n = Math.hypot(...v) || 1
  return v.map((x) => Math.round((x / n) * 1e4) / 1e4)
}
const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0)

type Saved = Record<string, Record<string, number[]>>
function readSaved(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}") as Saved
  } catch {
    return {}
  }
}
function writeSaved(s: Saved) {
  try {
    localStorage.setItem(STORE, JSON.stringify(s))
  } catch {
    // storage full or unavailable: the numbers last until the app closes
  }
}

export interface Searchable {
  id: string
  title: string
  prompt?: string
}

/**
 * The ids of files that mean what the search says, best first, or null when no embedding model is available (search by words only).
 * Files are turned into numbers the first time they are searched; later searches cost one short request.
 */
export function useMeaningSearch(items: Searchable[], query: string, settings: SettingsState | undefined): string[] | null {
  const [ids, setIds] = React.useState<string[] | null>(null)
  const embedder = React.useMemo(() => (settings ? embedderFor(settings) : undefined), [settings])
  React.useEffect(() => {
    const q = query.trim()
    if (!embedder || q.length < 3) {
      setIds(null)
      return
    }
    let gone = false
    const timer = setTimeout(async () => {
      try {
        const saved = readSaved()
        const mine = (saved[embedder.model] ??= {})
        const todo = items.filter((i) => !mine[i.id] && `${i.title} ${i.prompt ?? ""}`.trim())
        for (let at = 0; at < todo.length; at += 64) {
          const batch = todo.slice(at, at + 64)
          const vecs = await embed(embedder, batch.map((i) => `${i.title}. ${i.prompt ?? ""}`.slice(0, 2000)))
          batch.forEach((i, k) => vecs[k] && (mine[i.id] = norm(vecs[k]!)))
        }
        writeSaved(saved)
        const [qv] = await embed(embedder, [q])
        if (gone || !qv) return
        const target = norm(qv)
        const scored = items.filter((i) => mine[i.id]).map((i) => ({ id: i.id, score: cosine(target, mine[i.id]!) }))
        setIds(scored.filter((s) => s.score >= 0.3).sort((a, b) => b.score - a.score).map((s) => s.id))
      } catch {
        if (!gone) setIds(null)
      }
    }, 450)
    return () => {
      gone = true
      clearTimeout(timer)
    }
  }, [query, items, embedder])
  return ids
}
