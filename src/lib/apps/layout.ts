import type { AppInput } from "./types"

/**
 * How an app's inputs are laid out in the left sidebar. The agent only decides which inputs exist; this decides where they go,
 * so every app looks the same and the sidebar is always full, with no gap, by arranging the BLOCKS, never by adding inputs:
 *
 *  1. Upload blocks come first, in the order they were given. Cards (the default: a character, a place, a product) share ALL the
 *     height the sidebar has left after the fields and the small slots. How many go in a row is decided from how many there are and
 *     how much room there is, so that every card keeps a pleasant shape: two cards in a tall sidebar become two rows, each as wide as
 *     the sidebar; in a short one they sit side by side. An odd last card takes the full width.
 *  2. Slots (compact: a start image, an end image, a motion clip) go three to a row, small, at their natural size.
 *  3. A "several pictures" input is one strip of small pictures, a row of its own.
 *  4. Everything else (text, choices, sliders, switches) follows, one per row, at its natural size.
 *
 * The model, its generation settings and the Generate button are not here: they are fixed at the bottom of the sidebar.
 */

export type Row =
  | { kind: "blocks"; cols: 1 | 2 | 3; items: AppInput[] }
  | { kind: "strip"; item: AppInput }
  | { kind: "field"; item: AppInput }

export const isBlock = (i: AppInput) => i.type === "image" || i.type === "pdf" || i.type === "video" || i.type === "audio"

/** What a sidebar usually is, in pixels: the width of the column and the height left for inputs between the header and the bottom bar */
export const SIDEBAR = { width: 288, room: 520 } as const

/** How tall things are when they are not stretched, in pixels */
const HEIGHT = { slot: 100, strip: 64, field: 64, longtext: 130, gap: 12 } as const
const GAP = HEIGHT.gap
/** A card never gets smaller than this, and is happiest close to square */
const MIN_CARD = 110
const TARGET_SHAPE = 1.0

/** The height the fields, strips and slots take, with the gaps between all the rows */
export function fixedHeight(inputs: AppInput[]): number {
  const parts: number[] = []
  const slots = inputs.filter((i) => isBlock(i) && i.compact === true)
  for (let i = 0; i < slots.length; i += 3) parts.push(HEIGHT.slot)
  for (const i of inputs) {
    if (i.type === "images") parts.push(HEIGHT.strip)
    else if (!isBlock(i)) parts.push(i.type === "longtext" ? HEIGHT.longtext : HEIGHT.field)
  }
  const cards = inputs.filter((i) => isBlock(i) && i.compact !== true).length
  const rowsCount = parts.length + (cards > 0 ? 1 : 0)
  return parts.reduce((a, b) => a + b, 0) + Math.max(0, rowsCount - 1) * GAP
}

/** How many cards go in a row so that the cards fill the height with the nicest shapes */
export function cardColumns(count: number, width: number, height: number): 1 | 2 {
  if (count <= 1) return 1
  let best: 1 | 2 = 1
  let bestScore = Number.POSITIVE_INFINITY
  let anyFits = false
  for (const cols of [1, 2] as const) {
    const rows = Math.ceil(count / cols)
    const tileH = (height - (rows - 1) * GAP) / rows
    if (tileH < MIN_CARD) continue
    anyFits = true
    const widths: number[] = []
    for (let r = 0; r < rows; r++) {
      const inRow = Math.min(cols, count - r * cols)
      for (let k = 0; k < inRow; k++) widths.push((width - (inRow - 1) * GAP) / inRow)
    }
    const score = widths.reduce((sum, w) => sum + Math.abs(Math.log(w / tileH / TARGET_SHAPE)), 0) / widths.length
    if (score < bestScore) {
      bestScore = score
      best = cols
    }
  }
  // Not even one column fits at the minimum size: two columns use the room best
  return anyFits ? best : 2
}

/**
 * The rows for an app's inputs. With the size of the sidebar (pixels), the cards are arranged to fill what is left;
 * without it, two cards to a row.
 */
export function layoutInputs(inputs: AppInput[], size?: { width: number; height: number }): Row[] {
  const rows: Row[] = []
  const cards = inputs.filter((i) => isBlock(i) && i.compact !== true)
  const perCardRow = size && size.width > 0 && size.height > 0 ? cardColumns(cards.length, size.width, size.height - fixedHeight(inputs)) : 2
  // Runs of the same kind of block, kept in order
  const runs: Array<{ compact: boolean; items: AppInput[] }> = []
  for (const b of inputs.filter(isBlock)) {
    const compact = b.compact === true
    const last = runs[runs.length - 1]
    if (last && last.compact === compact) last.items.push(b)
    else runs.push({ compact, items: [b] })
  }
  for (const run of runs) {
    const per = run.compact ? 3 : perCardRow
    for (let i = 0; i < run.items.length; i += per) {
      const items = run.items.slice(i, i + per)
      rows.push({ kind: "blocks", cols: items.length as 1 | 2 | 3, items })
    }
  }
  for (const item of inputs.filter((i) => i.type === "images")) rows.push({ kind: "strip", item })
  for (const item of inputs.filter((i) => !isBlock(i) && i.type !== "images")) rows.push({ kind: "field", item })
  return rows
}

/** The arrangement in words, for the agent: what the screen will do with these blocks in a usual sidebar */
export function describeArrangement(inputs: AppInput[]): string {
  const cards = inputs.filter((i) => isBlock(i) && i.compact !== true)
  const slots = inputs.filter((i) => isBlock(i) && i.compact === true)
  const free = SIDEBAR.room - fixedHeight(inputs)
  const lines: string[] = []
  if (cards.length > 0) {
    const cols = cardColumns(cards.length, SIDEBAR.width, free)
    const rows = Math.ceil(cards.length / cols)
    const tile = Math.round((free - (rows - 1) * GAP) / rows)
    lines.push(`${cards.length} card${cards.length === 1 ? "" : "s"} (${cards.map((c) => c.label).join(", ")}): ${cols === 1 ? "one per row, full width" : "two per row"}, ${rows} row${rows === 1 ? "" : "s"}, ${cards.length === 1 ? "about" : "each about"} ${tile} tall. ${cards.length === 1 ? "It uses" : "They share"} all the free height, so there is no gap.`)
  }
  if (slots.length > 0) lines.push(`${slots.length} slot${slots.length === 1 ? "" : "s"} (${slots.map((c) => c.label).join(", ")}): three per row, small.`)
  const fields = inputs.filter((i) => !isBlock(i))
  if (fields.length > 0) lines.push(`${fields.length} field${fields.length === 1 ? "" : "s"} below (${fields.map((c) => c.label).join(", ")}).`)
  return lines.join(" ")
}
