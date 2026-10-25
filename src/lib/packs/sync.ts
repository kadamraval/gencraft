import { appAtLeast, validateManifest, validatePack, LIMITS } from "./validate"
import { sha256Hex, verifySignature } from "./verify"
import type { Channel, Pack } from "./types"
import { CHANNEL_OF } from "./types"

/**
 * One check of one channel against its published address: fetch the signed manifest, verify it, then fetch and verify each pack that
 * is newer than what is already held. Pure apart from the `fetcher` it is given, so it is tested without a network.
 */

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

export interface SyncResult {
  /** Packs fetched and accepted this time */
  packs: Pack[]
  /** The manifest's ETag, to ask "changed?" next time */
  etag?: string
  /** True when the server said nothing changed */
  unchanged?: boolean
  /** Packs that were skipped, each with the reason */
  skipped: string[]
}

const join = (base: string, rel: string) => (/^https?:\/\//i.test(rel) ? rel : new URL(rel, base.endsWith("/") ? base : `${base}/`).toString())

export async function syncChannel(opts: {
  channel: Channel
  /** Where the channel is published, ending in a slash or not */
  source: string
  /** Newest version already held for each pack id */
  held: Record<string, number>
  appVersion: string
  fetcher: Fetcher
  etag?: string
  publicKey?: JsonWebKey
}): Promise<SyncResult> {
  const { channel, source, held, appVersion, fetcher } = opts
  const skipped: string[] = []
  const manifestUrl = join(source, "manifest.json")
  const head = opts.etag ? { "If-None-Match": opts.etag } : undefined
  const res = await fetcher(manifestUrl, { headers: head, cache: "no-cache" })
  if (res.status === 304) return { packs: [], etag: opts.etag, unchanged: true, skipped }
  if (!res.ok) throw new Error(`The ${channel} content could not be read (HTTP ${res.status}).`)
  const etag = res.headers.get("ETag") ?? undefined
  const manifestBytes = new Uint8Array(await res.arrayBuffer())
  if (manifestBytes.byteLength > LIMITS.bytes) throw new Error("The manifest is too large.")
  const sigRes = await fetcher(join(source, "manifest.sig"), { cache: "no-cache" })
  if (!sigRes.ok) throw new Error(`The ${channel} content has no signature (HTTP ${sigRes.status}).`)
  const signature = await sigRes.text()
  if (!(await verifySignature(manifestBytes, signature, opts.publicKey))) throw new Error(`The ${channel} content is not signed by the publisher, so it was not used.`)
  const checked = validateManifest(JSON.parse(new TextDecoder().decode(manifestBytes)))
  if ("error" in checked) throw new Error(checked.error)
  if (checked.manifest.channel !== channel) throw new Error(`The manifest is for the ${checked.manifest.channel} channel, not ${channel}.`)

  const packs: Pack[] = []
  for (const entry of checked.manifest.packs) {
    if ((held[entry.id] ?? 0) >= entry.version) continue
    try {
      const packRes = await fetcher(join(manifestUrl, entry.url), { cache: "no-cache" })
      if (!packRes.ok) throw new Error(`HTTP ${packRes.status}`)
      const bytes = new Uint8Array(await packRes.arrayBuffer())
      if (bytes.byteLength > LIMITS.bytes) throw new Error("it is too large")
      if ((await sha256Hex(bytes)) !== entry.sha256) throw new Error("its contents do not match the manifest")
      const result = validatePack(JSON.parse(new TextDecoder().decode(bytes)))
      if ("error" in result) throw new Error(result.error)
      const { pack } = result
      if (pack.id !== entry.id || pack.version !== entry.version || pack.type !== entry.type) throw new Error("it does not match its manifest entry")
      if (CHANNEL_OF[pack.type] !== channel) throw new Error("it is in the wrong channel")
      if (pack.minApp && !appAtLeast(appVersion, pack.minApp)) {
        skipped.push(`${entry.id}: needs app ${pack.minApp} or newer`)
        continue
      }
      packs.push(pack)
    } catch (e) {
      skipped.push(`${entry.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { packs, etag, skipped }
}
