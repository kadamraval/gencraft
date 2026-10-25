import { verifySignature } from "../packs/verify"
import { validatePack } from "./schema"
import type { KnowledgePack } from "./schema"

/**
 * Fetches the published standard database and accepts it only if it is exactly what the publisher signed, is complete (the same gate the
 * build used) and is newer than what is held. Anything else leaves the held pack in place: the app never runs on a half-checked one.
 * Pure apart from the `fetcher` it is given, so it is tested without a network.
 */

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

export interface PackFetch {
  pack?: KnowledgePack
  /** Why nothing was taken, in plain words */
  skipped?: string
}

const join = (base: string, rel: string) => new URL(rel, base.endsWith("/") ? base : `${base}/`).toString()
const MAX_BYTES = 12 * 1024 * 1024

export async function fetchKnowledgePack(opts: { source: string; fetcher: Fetcher; heldGeneratedAt?: string; publicKey?: JsonWebKey }): Promise<PackFetch> {
  const { source, fetcher } = opts
  const res = await fetcher(join(source, "pack.json"), { cache: "no-cache" })
  if (!res.ok) return { skipped: `the model database could not be read (HTTP ${res.status})` }
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength > MAX_BYTES) return { skipped: "the model database is too large" }
  const sigRes = await fetcher(join(source, "pack.sig"), { cache: "no-cache" })
  if (!sigRes.ok) return { skipped: `the model database has no signature (HTTP ${sigRes.status})` }
  if (!(await verifySignature(bytes, await sigRes.text(), opts.publicKey))) return { skipped: "the model database is not signed by the publisher, so it was not used" }
  let pack: KnowledgePack
  try {
    pack = JSON.parse(new TextDecoder().decode(bytes)) as KnowledgePack
  } catch {
    return { skipped: "the model database is not readable" }
  }
  const problems = validatePack(pack)
  if (problems.length > 0) return { skipped: `the model database failed its checks: ${problems[0]}` }
  if (opts.heldGeneratedAt && pack.generatedAt <= opts.heldGeneratedAt) return { skipped: "nothing newer" }
  return { pack }
}
