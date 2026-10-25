import { appFetch } from "@/lib/registry/net"

/**
 * Tutorial videos come from Dailymotion's public API (no key needed). Each course is one search, see courses.ts.
 * Anything shorter than 30 seconds is left out, so clips and ads do not fill the lists.
 */
export interface Tutorial {
  id: string
  title: string
  thumbnail: string
  seconds: number
  channel: string
}

const cache = new Map<string, Tutorial[]>()

export async function fetchVideos(query: string, limit = 12, force = false): Promise<Tutorial[]> {
  const key = `${query}|${limit}`
  const hit = cache.get(key)
  if (hit && !force) return hit
  const url = `https://api.dailymotion.com/videos?search=${encodeURIComponent(query)}&fields=id,title,thumbnail_360_url,duration,owner.screenname&limit=${Math.min(100, limit * 2)}&sort=relevance&flags=no_live`
  const res = await appFetch(url)
  if (!res.ok) throw new Error(`Dailymotion answered ${res.status}.`)
  const json = (await res.json()) as { list?: Array<Record<string, unknown>> }
  const list = (json.list ?? [])
    .map((v) => ({
      id: String(v.id ?? ""),
      title: String(v.title ?? "").trim(),
      thumbnail: String(v.thumbnail_360_url ?? ""),
      seconds: Number(v.duration ?? 0),
      channel: String(v["owner.screenname"] ?? ""),
    }))
    .filter((v) => v.id && v.title && v.thumbnail && v.seconds >= 30)
    .slice(0, limit)
  cache.set(key, list)
  return list
}

export const embedUrl = (id: string) => `https://www.dailymotion.com/embed/video/${id}?autoplay=1`

export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}
