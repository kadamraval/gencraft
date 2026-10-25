import { executeTool } from "./composio"

/**
 * Pinterest through Composio: your boards, the pins on them, and a search over your own pins.
 * Composio passes Pinterest's answer on, and its wrapping can differ, so each reader looks for the list or the
 * field wherever it sits.
 */

const TOOLKIT = "pinterest"
const run = (key: string, slug: string, args: Record<string, unknown>) => executeTool(key, TOOLKIT, slug, args)

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v)

/** The list inside an answer: `items`, `pins`, `results` or the first list found one or two levels down. */
export function findList(data: unknown, depth = 0): Json[] {
  if (Array.isArray(data)) return data.filter(isObject)
  if (!isObject(data) || depth > 2) return []
  for (const k of ["items", "pins", "results", "boards", "data", "response_data", "response"]) {
    const found = findList(data[k], depth + 1)
    if (found.length > 0) return found
  }
  for (const v of Object.values(data)) {
    if (Array.isArray(v) && v.some(isObject)) return v.filter(isObject)
  }
  for (const v of Object.values(data)) {
    const found = findList(v, depth + 1)
    if (found.length > 0) return found
  }
  return []
}

export function findBookmark(data: unknown, depth = 0): string | undefined {
  if (!isObject(data) || depth > 2) return undefined
  const b = data.bookmark ?? data.next_bookmark
  if (typeof b === "string" && b) return b
  for (const v of Object.values(data)) {
    const found = findBookmark(v, depth + 1)
    if (found) return found
  }
  return undefined
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined)
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined)

// Boards

export interface PinBoard {
  id: string
  name: string
  description?: string
  privacy?: string
  pinCount?: number
  cover?: string
  /** Up to four small pictures of its pins */
  thumbs: string[]
}

export function parseBoards(data: unknown): PinBoard[] {
  return findList(data)
    .map((b): PinBoard | null => {
      const id = str(b.id)
      const name = str(b.name)
      if (!id || !name) return null
      const media = isObject(b.media) ? b.media : {}
      const thumbs = Array.isArray(media.pin_thumbnail_urls) ? (media.pin_thumbnail_urls as unknown[]) : []
      const small = thumbs.map(str).filter((u): u is string => Boolean(u)).slice(0, 4)
      const cover = str(media.image_cover_url) ?? small[0]
      return { id, name, description: str(b.description), privacy: str(b.privacy), pinCount: num(b.pin_count), cover, thumbs: small.length > 0 ? small : cover ? [cover] : [] }
    })
    .filter((b): b is PinBoard => b !== null)
}

// Pins

export interface Pin {
  id: string
  title: string
  description?: string
  link?: string
  /** A small picture for grids */
  thumb?: string
  /** The largest picture offered */
  image?: string
  isVideo?: boolean
}

/** Pinterest lists each picture in several sizes. The names are the sizes: pick by what is wanted, not by position. */
export function pinPictures(media: unknown): { thumb?: string; image?: string } {
  if (!isObject(media)) return {}
  const images = isObject(media.images) ? media.images : {}
  const url = (k: string) => (isObject(images[k]) ? str((images[k] as Json).url) : undefined)
  const sizes = Object.keys(images).filter((k) => url(k))
  const area = (k: string) => {
    const o = images[k] as Json
    return (num(o.width) ?? 0) * (num(o.height) ?? 0)
  }
  const bySize = [...sizes].sort((a, b) => area(a) - area(b))
  const thumb = url("400x300") ?? url("600x") ?? bySize.find((k) => area(k) >= 236 * 236) ?? bySize[0]
  const image = url("originals") ?? url("1200x") ?? url("600x") ?? bySize[bySize.length - 1]
  const cover = str(media.cover_image_url) ?? str(media.image_cover_url)
  return { thumb: thumb ? (url(thumb) ?? thumb) : cover, image: image ? (url(image) ?? image) : cover }
}

export function parsePin(p: Json): Pin | null {
  const id = str(p.id) ?? str(p.pin_id)
  if (!id) return null
  const pics = pinPictures(p.media)
  const mediaType = isObject(p.media) ? str((p.media as Json).media_type) : undefined
  return {
    id,
    title: str(p.title) ?? str(p.alt_text) ?? str(p.description)?.slice(0, 80) ?? "Pin",
    description: str(p.description),
    link: str(p.link),
    thumb: pics.thumb,
    image: pics.image,
    isVideo: mediaType === "video",
  }
}

export function parsePins(data: unknown): Pin[] {
  return findList(data)
    .map(parsePin)
    .filter((p): p is Pin => p !== null)
}

export async function listBoards(key: string, bookmark?: string): Promise<{ boards: PinBoard[]; bookmark?: string }> {
  const data = await run(key, "PINTEREST_LIST_BOARDS", { privacy: "ALL", page_size: 50, ...(bookmark ? { bookmark } : {}) })
  return { boards: parseBoards(data), bookmark: findBookmark(data) }
}

export async function listBoardPins(key: string, boardId: string, bookmark?: string): Promise<{ pins: Pin[]; bookmark?: string }> {
  const data = await run(key, "PINTEREST_LIST_PINS", { board_id: boardId, page_size: 50, ...(bookmark ? { bookmark } : {}) })
  return { pins: parsePins(data), bookmark: findBookmark(data) }
}

export async function searchMyPins(key: string, query: string): Promise<Pin[]> {
  return parsePins(await run(key, "PINTEREST_SEARCH_OWN_CONTENT", { resource_type: "pins", query, page_size: 50 }))
}
