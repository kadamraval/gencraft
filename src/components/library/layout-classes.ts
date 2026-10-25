import type { CardSizeStep, LayoutMode, MediaAsset } from "@/types"
import type { DetailMediaItem } from "@/components/media-vault/media-detail-modal"

/** Grid and masonry column classes for each card size, shared by the Library and the Create galleries. */
export function gridClass(step: CardSizeStep): string {
  switch (step) {
    case 2:
      return "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3"
    case 3:
      return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5"
    case 4:
      return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
    case 1:
    default:
      return "grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2.5"
  }
}

export function masonryClass(step: CardSizeStep): string {
  switch (step) {
    case 2:
      return "columns-3 sm:columns-4 md:columns-6 lg:columns-8 gap-3 space-y-3"
    case 3:
      return "columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-3.5 space-y-3.5"
    case 4:
      return "columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4"
    case 1:
    default:
      return "columns-4 sm:columns-6 md:columns-8 lg:columns-10 gap-2.5 space-y-2.5"
  }
}

/** "16:9" as a number, or undefined for anything that is not a width and a height ("auto", "match_input_image") */
export function ratioOf(aspectRatio: string | undefined): number | undefined {
  const m = aspectRatio?.trim().match(/^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/i)
  if (!m) return undefined
  const r = Number(m[1]) / Number(m[2])
  return Number.isFinite(r) && r > 0 ? r : undefined
}

/**
 * The shape of a tile. In the square layout every tile is a square (a picture is cropped to fit: that is what the layout is). In the
 * masonry layout a tile is the picture's own shape, so nothing is cropped: from its ratio when it has one, and from the picture once it has
 * loaded when it does not ("auto" sizes the picture to what you gave it).
 */
export function aspectClassFor(layout: LayoutMode, _aspectRatio: string | undefined): string {
  return layout === "square" ? "aspect-square" : ""
}

export function toDetailItem(a: MediaAsset): DetailMediaItem {
  return {
    id: a.id,
    title: a.title,
    type: a.type,
    url: a.url,
    thumbnailUrl: a.thumbnailUrl,
    prompt: a.prompt,
    aspectRatio: a.aspectRatio,
    model: a.model,
    quality: "",
    bitrate: "",
    size: "",
    status: a.status,
    activity: a.source === "uploaded" ? "uploaded" : "generated",
    authorName: "You",
    duration: a.duration,
    createdAt: a.createdAt,
    error: a.error,
    errorInfo: a.errorInfo,
    log: a.log,
    params: a.params,
    provider: a.provider,
  }
}
