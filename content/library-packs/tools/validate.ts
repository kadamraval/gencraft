import { readTransitionUniforms } from "./glsl.ts"
import { CHANNEL_OF, PACK_TYPES } from "./types.ts"
import type { Manifest, Pack, PackItem, PackType } from "./types"

/**
 * Checks a pack before it is used: the app checks what it downloads, and the publishing script checks what you wrote. A pack
 * that fails is ignored whole, with the first problem named. Nothing here runs anything.
 */

export const LIMITS = { items: 2000, bytes: 4_000_000, text: 4000, tags: 12 }

const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/

/** The ClipFx fields an effect may set */
export const EFFECT_KEYS = ["opacity", "blend", "scale", "x", "y", "rotation", "flipH", "flipV", "cropL", "cropT", "cropR", "cropB", "speed", "brightness", "contrast", "saturation", "blur", "fadeIn", "fadeOut", "volume"] as const
export const BLENDS = ["normal", "multiply", "screen", "overlay", "darken", "lighten"] as const
export const TRANSITION_KINDS = ["fade-in", "fade-out", "fade-both", "dip", "none", "shader"] as const
export const SHADER_LIMIT = 8000
export const CAPTION_STYLE_KEYS: Record<string, readonly string[]> = {
  size: ["s", "m", "l", "xl"],
  position: ["top", "middle", "bottom"],
  animation: ["none", "fade", "rise", "pop", "typewriter"],
  font: ["sans", "serif", "mono", "display"],
  color: ["white", "yellow", "black", "red", "cyan"],
  look: ["outline", "shadow", "box", "none"],
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const isText = (v: unknown, max = LIMITS.text): v is string => typeof v === "string" && v.length > 0 && v.length <= max

function checkData(type: PackType, data: Record<string, unknown>): string | null {
  if (type === "effect") {
    const patch = data.patch
    if (!isObject(patch) || Object.keys(patch).length === 0) return "an effect needs a patch with at least one field"
    for (const [key, value] of Object.entries(patch)) {
      if (!(EFFECT_KEYS as readonly string[]).includes(key)) return `the effect field "${key}" is not one the editor has`
      if (key === "blend") {
        if (!(BLENDS as readonly string[]).includes(String(value))) return `blend "${String(value)}" is not a known blend`
      } else if (key === "flipH" || key === "flipV") {
        if (typeof value !== "boolean") return `${key} must be true or false`
      } else if (typeof value !== "number" || !Number.isFinite(value)) return `${key} must be a number`
    }
    return null
  }
  if (type === "transition") {
    if (!(TRANSITION_KINDS as readonly string[]).includes(String(data.kind))) return `the transition kind "${String(data.kind)}" is not one the editor has`
    if (data.kind === "shader") {
      // A shader transition changes from one clip to the next over its length, and the clips overlap by that much
      if (typeof data.glsl !== "string" || data.glsl.length === 0 || data.glsl.length > SHADER_LIMIT) return `a shader transition needs shader text of up to ${SHADER_LIMIT} characters`
      const read = readTransitionUniforms(data.glsl)
      if ("error" in read) return read.error
      if (data.duration !== undefined && (typeof data.duration !== "number" || data.duration < 0.1 || data.duration > 5)) return "duration must be a number from 0.1 to 5"
      if (data.params !== undefined) {
        if (!isObject(data.params)) return "params must be an object"
        const names = new Set(read.uniforms.map((u) => u.name))
        for (const [key, value] of Object.entries(data.params)) {
          if (!names.has(key)) return `params names "${key}", which the shader does not declare`
          const ok = typeof value === "number" || typeof value === "boolean" || (Array.isArray(value) && value.length <= 4 && value.every((n) => typeof n === "number"))
          if (!ok) return `params "${key}" must be a number, true or false, or up to four numbers`
        }
      }
    }
    return null
  }
  if (type === "caption-style" || type === "text-style") {
    const style = data.style
    if (!isObject(style) || Object.keys(style).length === 0) return "a style needs a style with at least one field"
    for (const [key, value] of Object.entries(style)) {
      const allowed = CAPTION_STYLE_KEYS[key]
      if (!allowed) return `the style field "${key}" is not one the editor has`
      if (!allowed.includes(String(value))) return `${key} "${String(value)}" is not one of ${allowed.join(", ")}`
    }
    return null
  }
  // Overlays, elements, templates and prompt elements take their data shapes in later versions: only that it is an object
  return null
}

/** Returns the pack when it is sound, otherwise the first problem as text */
export function validatePack(raw: unknown): { pack: Pack } | { error: string } {
  if (!isObject(raw)) return { error: "the pack is not an object" }
  const { id, title, version, type, minApp, license, items } = raw
  if (typeof id !== "string" || !ID.test(id)) return { error: "the pack id must be lowercase letters, digits, dot, dash or underscore" }
  if (!isText(title, 120)) return { error: `pack ${id}: it needs a title` }
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return { error: `pack ${id}: version must be a whole number from 1` }
  if (typeof type !== "string" || !(PACK_TYPES as readonly string[]).includes(type)) return { error: `pack ${id}: unknown type "${String(type)}"` }
  if (minApp !== undefined && (typeof minApp !== "string" || !/^\d+\.\d+\.\d+$/.test(minApp))) return { error: `pack ${id}: minApp must look like 0.4.0` }
  if (license !== undefined && !isText(license, 400)) return { error: `pack ${id}: the license note is too long` }
  if (!Array.isArray(items) || items.length === 0) return { error: `pack ${id}: it has no items` }
  if (items.length > LIMITS.items) return { error: `pack ${id}: more than ${LIMITS.items} items` }
  const seen = new Set<string>()
  const clean: PackItem[] = []
  for (const it of items) {
    if (!isObject(it)) return { error: `pack ${id}: an item is not an object` }
    if (typeof it.id !== "string" || !ID.test(it.id)) return { error: `pack ${id}: an item id "${String(it.id)}" is not valid` }
    if (seen.has(it.id)) return { error: `pack ${id}: the item id "${it.id}" is used twice` }
    seen.add(it.id)
    if (!isText(it.name, 120)) return { error: `pack ${id}: item ${it.id} needs a name` }
    if (it.description !== undefined && !isText(it.description, 400)) return { error: `pack ${id}: item ${it.id} has a description that is too long` }
    if (it.tags !== undefined && (!Array.isArray(it.tags) || it.tags.length > LIMITS.tags || it.tags.some((t) => !isText(t, 40)))) return { error: `pack ${id}: item ${it.id} has bad tags` }
    if (it.thumb !== undefined && !isText(it.thumb, 2000)) return { error: `pack ${id}: item ${it.id} has a bad thumb` }
    if (!isObject(it.data)) return { error: `pack ${id}: item ${it.id} needs data` }
    const problem = checkData(type as PackType, it.data)
    if (problem) return { error: `pack ${id}: item ${it.id}: ${problem}` }
    clean.push({ id: it.id, name: it.name, tags: it.tags as string[] | undefined, description: it.description as string | undefined, thumb: it.thumb as string | undefined, data: it.data })
  }
  return { pack: { id, title, version, type: type as PackType, minApp: minApp as string | undefined, license: license as string | undefined, items: clean } }
}

export function validateManifest(raw: unknown): { manifest: Manifest } | { error: string } {
  if (!isObject(raw) || raw.format !== 1) return { error: "the manifest has an unknown format" }
  if (raw.channel !== "editor" && raw.channel !== "library") return { error: "the manifest channel must be editor or library" }
  if (!Array.isArray(raw.packs)) return { error: "the manifest lists no packs" }
  const packs: Manifest["packs"] = []
  for (const p of raw.packs) {
    if (!isObject(p) || typeof p.id !== "string" || !ID.test(p.id)) return { error: "a manifest entry has a bad id" }
    if (typeof p.version !== "number" || !Number.isInteger(p.version) || p.version < 1) return { error: `entry ${p.id}: bad version` }
    if (typeof p.type !== "string" || !(PACK_TYPES as readonly string[]).includes(p.type)) return { error: `entry ${p.id}: unknown type` }
    if (CHANNEL_OF[p.type as PackType] !== raw.channel) return { error: `entry ${p.id}: a ${p.type} pack does not belong in the ${raw.channel} channel` }
    if (typeof p.url !== "string" || p.url.length === 0 || p.url.length > 2000) return { error: `entry ${p.id}: bad url` }
    if (typeof p.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(p.sha256)) return { error: `entry ${p.id}: bad sha256` }
    packs.push({ id: p.id, version: p.version, type: p.type as PackType, url: p.url, sha256: p.sha256 })
  }
  return { manifest: { format: 1, channel: raw.channel, updated: typeof raw.updated === "string" ? raw.updated : "", packs } }
}

/** True when version a (like 0.4.0) is the same or newer than b. Only the numbers count: 0.1.0-beta.1 is treated as 0.1.0, so a beta build can use packs made for 0.1.0. */
export function appAtLeast(a: string, b: string): boolean {
  const x = a.split(/[-+]/)[0].split(".").map(Number)
  const y = b.split(/[-+]/)[0].split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  }
  return true
}
