/**
 * Replicate's catalog without a token. The API needs one; the public site shows the same facts. This answers the three
 * calls `fetchReplicateModels` makes from the public pages, so the registry build reads Replicate the same way with or
 * without a key:
 *   /v1/collections            the topic list (replicate.com/collections)
 *   /v1/collections/{slug}     the models on one collection page
 *   /v1/models/{owner}/{name}  the model, built from its own page (description, version, input schema)
 */
import { parseReplicatePublicSchema } from "../../src/lib/registry/adapters/replicate.ts"
import type { ReplicateFetch } from "../../src/lib/registry/adapters/replicate.ts"

const UA = { "user-agent": "Mozilla/5.0" }
const NOT_MODELS = /^(collections|explore|docs|pricing|blog|changelog|about|account|support|terms|privacy|login|signin|home|models|playground|careers|security|status|brand|jobs|press|try-for-free)$/i

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

async function page(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: UA })
      if (res.ok) return await res.text()
      if (res.status !== 429 && res.status < 500) return null
    } catch {
      // try again
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
  }
  return null
}

export function publicReplicateCall(): ReplicateFetch {
  return async (path) => {
    if (path === "/v1/collections") {
      const html = await page("https://replicate.com/collections")
      if (!html) return json({ detail: "collections page unavailable" }, 502)
      const slugs = [...new Set([...html.matchAll(/href="\/collections\/([a-z0-9-]+)"/g)].map((m) => m[1]!))]
      return json({ results: slugs.map((slug) => ({ slug })) })
    }
    const col = /^\/v1\/collections\/([a-z0-9-]+)$/.exec(path)
    if (col) {
      const html = await page(`https://replicate.com/collections/${col[1]}`)
      if (!html) return json({ detail: "collection page unavailable" }, 502)
      const ids = [...new Set([...html.matchAll(/href="\/([a-z0-9][\w.-]*)\/([\w.-]+)"/gi)].filter((m) => !NOT_MODELS.test(m[1]!)).map((m) => `${m[1]}/${m[2]}`))]
      return json({ models: ids.map((id) => ({ owner: id.split("/")[0], name: id.split("/")[1] })) })
    }
    const mod = /^\/v1\/models\/([^/]+)\/([^/]+)$/.exec(path)
    if (mod) {
      const [, owner, name] = mod
      const html = await page(`https://replicate.com/${owner}/${name}`)
      if (!html) return json({ detail: "model page unavailable" }, 404)
      const schema = parseReplicatePublicSchema(html)
      const at = html.indexOf('"model":')
      const desc = /"description":\s*"((?:[^"\\]|\\.)*)"/.exec(html.slice(at >= 0 ? at : 0))
      return json({
        owner,
        name,
        description: desc ? (JSON.parse(`"${desc[1]}"`) as string) : undefined,
        latest_version: schema ? { id: schema.versionId ?? "public", openapi_schema: schema.openapi_schema } : undefined,
      })
    }
    return json({ detail: `not available without a token: ${path}` }, 404)
  }
}
