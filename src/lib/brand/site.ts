import { appFetch, isDesktopApp } from "@/lib/registry/net"
import { shrinkImage } from "./image"

/**
 * Reads a brand's website for its name and logo (and, on the way, a description and its social links).
 * The desktop app fetches the page directly. In a plain browser the page is read through the dev server, because
 * most sites refuse requests from another web page.
 */

export interface SiteBrand {
  domain: string
  name: string
  logo?: string
  description?: string
  social: Array<{ platform: string; url: string }>
}

const SOCIAL: Array<{ platform: string; hosts: string[] }> = [
  { platform: "Instagram", hosts: ["instagram.com"] },
  { platform: "X", hosts: ["twitter.com", "x.com"] },
  { platform: "Facebook", hosts: ["facebook.com", "fb.com"] },
  { platform: "LinkedIn", hosts: ["linkedin.com"] },
  { platform: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { platform: "TikTok", hosts: ["tiktok.com"] },
  { platform: "Pinterest", hosts: ["pinterest.com"] },
]

export const SOCIAL_PLATFORMS = [...SOCIAL.map((s) => s.platform), "Other"]

const normalize = (input: string): URL | null => {
  const t = input.trim()
  if (!t) return null
  try {
    return new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`)
  } catch {
    return null
  }
}

async function get(url: string): Promise<Response> {
  const res = isDesktopApp() ? await appFetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }) : await fetch(`/api/proxy/site?url=${encodeURIComponent(url)}`)
  if (!res.ok) throw new Error(`The site answered ${res.status}.`)
  return res
}

async function logoFromUrl(url: string): Promise<string | undefined> {
  try {
    const blob = await (await get(url)).blob()
    if (blob.size === 0 || blob.size > 4_000_000) return undefined
    if (blob.type.includes("svg") || url.toLowerCase().split("?")[0]!.endsWith(".svg")) {
      const text = await blob.text()
      return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`
    }
    return await shrinkImage(new File([blob], "logo", { type: blob.type || "image/png" }), "logo")
  } catch {
    return undefined
  }
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim()

export async function readSite(input: string): Promise<SiteBrand> {
  const base = normalize(input)
  if (!base) throw new Error("That does not look like a web address.")
  let html: string
  try {
    html = await (await get(base.href)).text()
  } catch (e) {
    throw new Error(e instanceof Error && e.message.startsWith("The site") ? e.message : "Could not open that site from here.")
  }
  const doc = new DOMParser().parseFromString(html, "text/html")
  const meta = (key: string) => clean(doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`)?.getAttribute("content"))
  const abs = (href: string | null | undefined) => {
    if (!href) return undefined
    try {
      return new URL(href, base).href
    } catch {
      return undefined
    }
  }

  const host = base.hostname.replace(/^www\./, "")
  const title = clean(doc.querySelector("title")?.textContent)
  const name = meta("og:site_name") || meta("application-name") || clean(title.split(/\s[|\-–—:·]\s/)[0]) || host.split(".")[0]!.replace(/^./, (c) => c.toUpperCase())

  // Where a logo might be, best first: a picture marked as the logo, then the touch icon, then the page icon
  const candidates: string[] = []
  // Only pictures in the page header or on a link home count, so a photo that merely has "brand" in its name is not taken
  for (const img of Array.from(doc.querySelectorAll('header img, nav img, a[href="/"] img')).slice(0, 20)) {
    const hint = `${img.getAttribute("src") ?? ""} ${img.getAttribute("alt") ?? ""} ${img.className} ${img.id}`.toLowerCase()
    if (/logo/.test(hint) && !/sprite|payment|partner|customer|client/.test(hint)) {
      const u = abs(img.getAttribute("src"))
      if (u && !u.startsWith("data:")) candidates.push(u)
    }
  }
  const icons = Array.from(doc.querySelectorAll('link[rel~="icon"], link[rel~="apple-touch-icon"], link[rel~="shortcut"]'))
    .map((l) => ({ href: abs(l.getAttribute("href")), size: parseInt((l.getAttribute("sizes") ?? "0").split("x")[0]!, 10) || 0, touch: (l.getAttribute("rel") ?? "").includes("apple") }))
    .filter((i): i is { href: string; size: number; touch: boolean } => Boolean(i.href))
    .sort((a, b) => Number(b.touch) - Number(a.touch) || b.size - a.size)
  candidates.push(...icons.map((i) => i.href), `${base.origin}/favicon.ico`)

  let logo: string | undefined
  for (const url of [...new Set(candidates)].slice(0, 6)) {
    logo = await logoFromUrl(url)
    if (logo) break
  }

  const social: SiteBrand["social"] = []
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    const u = abs(a.getAttribute("href"))
    if (!u) continue
    let h: string
    try {
      h = new URL(u).hostname.replace(/^www\./, "")
    } catch {
      continue
    }
    const hit = SOCIAL.find((s) => s.hosts.some((x) => h === x || h.endsWith(`.${x}`)))
    if (hit && !social.some((s) => s.platform === hit.platform) && new URL(u).pathname.length > 1) social.push({ platform: hit.platform, url: u })
  }

  return { domain: host, name, logo, description: meta("og:description") || meta("description") || undefined, social }
}
