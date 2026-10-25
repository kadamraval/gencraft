/**
 * Content packs: the things the editor and the library offer (effects, transitions, caption styles, text styles, elements,
 * templates) kept as plain data so they can be updated from GitHub without a new version of the app.
 *
 * Two channels, two repositories: "editor" (effects, transitions, caption and text styles, overlays) and "library"
 * (elements and templates). A pack is data only: values for controls the app already has, shader text, and files named by
 * their hash. Never code.
 */

export const PACK_TYPES = ["effect", "transition", "caption-style", "text-style", "overlay", "element", "template", "prompt-element"] as const
export type PackType = (typeof PACK_TYPES)[number]
export type Channel = "editor" | "library"

/** Which channel carries which kind of pack */
export const CHANNEL_OF: Record<PackType, Channel> = {
  effect: "editor",
  transition: "editor",
  "caption-style": "editor",
  "text-style": "editor",
  overlay: "editor",
  element: "library",
  template: "library",
  "prompt-element": "library",
}

export interface PackItem {
  /** Lowercase letters, digits, dot, dash and underscore. Unique across all packs of a type. */
  id: string
  name: string
  tags?: string[]
  /** One line for people and for the agent */
  description?: string
  /** Small picture: a path inside the pack's folder or a data address */
  thumb?: string
  /** What the item does, by type (see validate.ts) */
  data: Record<string, unknown>
}

export interface Pack {
  id: string
  title: string
  /** Whole number, higher replaces lower */
  version: number
  type: PackType
  /** Lowest app version that can use it, like "0.4.0" */
  minApp?: string
  /** Where the items come from and under what licence, for anything imported */
  license?: string
  items: PackItem[]
}

export interface ManifestEntry {
  id: string
  version: number
  type: PackType
  /** Relative to the manifest, or absolute */
  url: string
  /** Hex SHA-256 of the pack file's exact bytes */
  sha256: string
}

export interface Manifest {
  format: 1
  channel: Channel
  updated: string
  packs: ManifestEntry[]
}
