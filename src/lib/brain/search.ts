import { appFetch, isDesktopApp } from "@/lib/registry/net"

/**
 * Web search for models whose provider has no search of its own (Replicate, or any chat model that is not on OpenAI,
 * Google Gemini or OpenRouter). It reads DuckDuckGo's plain results page, so it needs no key. It is best effort: a page
 * that changes or a rate limit gives an error the model is told about, never an invented answer.
 */

export interface SearchHit {
  title: string
  url: string
  snippet: string
}

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()

/** DuckDuckGo wraps each result address in a redirect: the real one is in the uddg parameter */
function unwrap(href: string): string {
  try {
    const u = new URL(href, "https://duckduckgo.com")
    return u.searchParams.get("uddg") ?? u.href
  } catch {
    return href
  }
}

export function parseResults(html: string, limit = 6): SearchHit[] {
  const hits: SearchHit[] = []
  for (const block of html.split(/class="result[ "]/).slice(1)) {
    const link = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block)
    if (!link) continue
    const snippet = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/.exec(block)
    const url = unwrap(link[1]!.replace(/&amp;/g, "&"))
    if (!/^https?:/.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue
    hits.push({ title: text(link[2]!), url, snippet: snippet ? text(snippet[1]!) : "" })
    if (hits.length >= limit) break
  }
  return hits
}

export async function searchWeb(query: string): Promise<SearchHit[]> {
  const target = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const res = isDesktopApp() ? await appFetch(target, { headers: { "User-Agent": "Mozilla/5.0" } }) : await fetch(`/api/proxy/site?url=${encodeURIComponent(target)}`)
  if (!res.ok) throw new Error(`the search service answered ${res.status}`)
  const hits = parseResults(await res.text())
  if (hits.length === 0) throw new Error("the search returned no results (it may be rate limited; try again in a minute)")
  return hits
}
