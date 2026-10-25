import type { BrandColorItem, BrandKit, BrandTypographyItem } from "@/types/brand"

/**
 * What the Agent can change in a kit. It is asked for a short note and a JSON list of operations; each valid one is
 * applied, anything else is ignored, so a confused reply can never damage the kit.
 */

export type BrandOp =
  | { op: "name" | "tagline" | "about"; text: string }
  | { op: "addColor"; name: string; hex: string; role: BrandColorItem["role"] }
  | { op: "removeColor"; name: string }
  | { op: "font"; role: BrandTypographyItem["role"]; family: string }
  | { op: "addRule"; text: string }
  | { op: "removeRule"; n: number }

const ROLES: BrandColorItem["role"][] = ["primary", "secondary", "accent", "background", "surface"]
const FONT_ROLES: BrandTypographyItem["role"][] = ["heading", "body", "accent", "mono"]
const HEX = /^#[0-9a-f]{6}$/i

export const OP_FORMAT =
  'Reply with one short sentence, then a JSON list of changes. Allowed changes: {"op":"name|tagline|about","text":""}, {"op":"addColor","name":"","hex":"#RRGGBB","role":"primary|secondary|accent|background|surface"}, {"op":"removeColor","name":""}, {"op":"font","role":"heading|body|accent|mono","family":"a Google Font"}, {"op":"addRule","text":""}, {"op":"removeRule","n":1}. If nothing should change, give an empty list [].'

export function describeKit(kit: BrandKit): string {
  const lines = [
    `Name: ${kit.name}`,
    kit.domain ? `Website: ${kit.domain}` : "",
    kit.tagline ? `Tagline: ${kit.tagline}` : "",
    kit.about ? `About: ${kit.about}` : "",
    `Colors: ${kit.colors.map((c) => `${c.name} ${c.hex} (${c.role})`).join(", ") || "none"}`,
    `Fonts: ${kit.typography.map((t) => `${t.role} ${t.fontFamily}`).join(", ") || "none"}`,
    `Rules: ${kit.instructions.map((r, i) => `${i + 1}. ${r}`).join(" ") || "none"}`,
    `Products: ${kit.products.map((p) => p.name).join(", ") || "none"}`,
  ]
  return lines.filter(Boolean).join("\n")
}

/** A short brand line for a picture, video or sound prompt: colours, fonts and rules, kept under 480 characters */
export function brandBrief(kit: BrandKit): string {
  const parts = [
    `Brand: ${kit.name}${kit.tagline ? ` ("${kit.tagline}")` : ""}.`,
    kit.colors.length > 0 ? `Brand colors: ${kit.colors.slice(0, 5).map((c) => `${c.name} ${c.hex}`).join(", ")}.` : "",
    kit.typography.length > 0 ? `Brand fonts: ${kit.typography.slice(0, 2).map((t) => t.fontFamily).join(", ")}.` : "",
    kit.instructions.length > 0 ? `Brand rules: ${kit.instructions.join(" ")}` : "",
  ].filter(Boolean)
  const text = parts.join(" ")
  return text.length > 480 ? `${text.slice(0, 477).trimEnd()}...` : text
}

export function parseBrandOps(reply: string): BrandOp[] {
  const start = reply.indexOf("[")
  const end = reply.lastIndexOf("]")
  if (start < 0 || end <= start) return []
  let raw: unknown
  try {
    raw = JSON.parse(reply.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const ops: BrandOp[] = []
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue
    const o = item as Record<string, unknown>
    const text = typeof o.text === "string" ? o.text.trim() : ""
    switch (o.op) {
      case "name":
      case "tagline":
      case "about":
        if (text) ops.push({ op: o.op, text })
        break
      case "addColor": {
        const hex = typeof o.hex === "string" ? (o.hex.startsWith("#") ? o.hex : `#${o.hex}`) : ""
        if (!HEX.test(hex)) break
        const role = ROLES.includes(o.role as never) ? (o.role as BrandColorItem["role"]) : "accent"
        ops.push({ op: "addColor", name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : hex.toUpperCase(), hex: hex.toUpperCase(), role })
        break
      }
      case "removeColor":
        if (typeof o.name === "string" && o.name.trim()) ops.push({ op: "removeColor", name: o.name.trim() })
        break
      case "font": {
        const family = typeof o.family === "string" ? o.family.trim() : ""
        if (family && FONT_ROLES.includes(o.role as never)) ops.push({ op: "font", role: o.role as BrandTypographyItem["role"], family })
        break
      }
      case "addRule":
        if (text) ops.push({ op: "addRule", text })
        break
      case "removeRule": {
        const n = Number(o.n)
        if (Number.isInteger(n) && n >= 1) ops.push({ op: "removeRule", n })
        break
      }
    }
  }
  return ops
}

/** Applies the changes in order. `changes` says in plain words what happened, for the Agent's reply. */
export function applyBrandOps(kit: BrandKit, ops: BrandOp[]): { kit: BrandKit; changes: string[]; skipped: number } {
  let k = kit
  const changes: string[] = []
  let skipped = 0
  for (const op of ops) {
    switch (op.op) {
      case "name":
      case "tagline":
      case "about":
        k = { ...k, [op.op]: op.text }
        changes.push(`Changed the ${op.op}`)
        break
      case "addColor":
        if (k.colors.some((c) => c.hex.toLowerCase() === op.hex.toLowerCase())) {
          skipped++
          break
        }
        k = { ...k, colors: [...k.colors, { id: `col-${Date.now()}-${k.colors.length}`, name: op.name, hex: op.hex, role: op.role }] }
        changes.push(`Added ${op.name} ${op.hex}`)
        break
      case "removeColor": {
        const left = k.colors.filter((c) => c.name.toLowerCase() !== op.name.toLowerCase())
        if (left.length === k.colors.length) skipped++
        else {
          k = { ...k, colors: left }
          changes.push(`Removed ${op.name}`)
        }
        break
      }
      case "font": {
        const rest = k.typography.filter((t) => t.role !== op.role)
        k = { ...k, typography: [...rest, { id: `font-${Date.now()}-${op.role}`, role: op.role, fontFamily: op.family }] }
        changes.push(`Set the ${op.role} font to ${op.family}`)
        break
      }
      case "addRule":
        if (k.instructions.includes(op.text)) skipped++
        else {
          k = { ...k, instructions: [...k.instructions, op.text] }
          changes.push("Added a rule")
        }
        break
      case "removeRule":
        if (op.n > k.instructions.length) skipped++
        else {
          k = { ...k, instructions: k.instructions.filter((_, i) => i !== op.n - 1) }
          changes.push(`Removed rule ${op.n}`)
        }
        break
    }
  }
  return { kit: k, changes, skipped }
}
