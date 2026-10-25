/**
 * Several shots in one clip, written the way each maker documents it. The maker's own page is the source; each format
 * is a different way to say the same thing, so a prompt written for one does not work for another.
 *
 *   Wan 3.0    "0s - 5s: shot"            timestamped storyboard, 4 to 6 seconds a shot, up to 30 s
 *   Seedance   "0s-3s: shot"              timestamps, integer seconds, no gaps (2.0 only understands "Shot N")
 *   Kling 3.0  "shot 1, 5, words;"        1 to 6 shots, each at least 1 s, durations add up to the clip, 512 characters each
 */

export interface Shot {
  text: string
  seconds: number
}

/** Each shot with the second it starts and ends at. */
function timeline(shots: Shot[]): Array<Shot & { from: number; to: number }> {
  let at = 0
  return shots.map((s) => {
    const row = { ...s, from: at, to: at + s.seconds }
    at = row.to
    return row
  })
}

export const totalOf = (shots: Shot[]): number => shots.reduce((n, s) => n + s.seconds, 0)

export const wanStoryboard = (shots: Shot[]): string => timeline(shots).map((s) => `${s.from}s - ${s.to}s: ${s.text}`).join("\n")

export const seedanceStoryboard = (shots: Shot[]): string => timeline(shots).map((s) => `${s.from}s-${s.to}s: ${s.text}`).join("\n")

/** Seedance 2.0 does not read timestamps, only shot numbers */
export const numberedShots = (shots: Shot[]): string => shots.map((s, i) => `Shot ${i + 1}: ${s.text}`).join("\n")

export const klingShots = (shots: Shot[]): string => shots.map((s, i) => `shot ${i + 1}, ${s.seconds}, ${s.text.replace(/\s*[;\n]+\s*/g, ", ").trim()};`).join(" ")

/** The seconds each of n shots gets when the person has not set them: whole seconds, the last takes the rest. */
export function evenShots(texts: string[], totalSeconds: number): Shot[] {
  const clean = texts.map((t) => t.trim()).filter(Boolean)
  if (clean.length === 0) return []
  const total = Math.max(clean.length, Math.round(totalSeconds))
  const each = Math.floor(total / clean.length)
  return clean.map((text, i) => ({ text, seconds: i === clean.length - 1 ? total - each * (clean.length - 1) : each }))
}

/** Cautions about shots against a maker's own limits. */
export function lintShots(shots: Shot[], limits: { min?: number; max?: number; minShots?: number; maxShots?: number; maxChars?: number }): string[] {
  const out: string[] = []
  if (limits.maxShots && shots.length > limits.maxShots) out.push(`This model takes at most ${limits.maxShots} shots; you wrote ${shots.length}.`)
  if (limits.min && shots.some((s) => s.seconds < limits.min!)) out.push(`Each shot should run at least ${limits.min} s.`)
  if (limits.max && shots.some((s) => s.seconds > limits.max!)) out.push(`Shots work best at ${limits.max} s or less; split a longer one.`)
  if (limits.maxChars && shots.some((s) => s.text.length > limits.maxChars!)) out.push(`A shot can hold ${limits.maxChars} characters; shorten the longest.`)
  return out
}

/** "4s A knight rides" or "4s: A knight rides" sets that shot's length. */
const LEAD = /^\s*(\d+(?:\.\d+)?)\s*s\b\s*[:\-–]?\s*(.*)$/i

/**
 * Shots from the lines a person wrote. A line that starts with its length ("4s ...") keeps it; the other lines share the
 * rest of the clip in whole seconds, the last taking what is left. When every line has a length, the clip is as long as
 * they add up to (`userSet`), and the length rules can read that.
 */
export function plannedShots(lines: string[], totalSeconds: number): { shots: Shot[]; userSet: boolean } {
  const parsed = lines.map((l) => {
    const m = LEAD.exec(l)
    return m ? { text: m[2]!.trim(), seconds: Math.round(Number(m[1]) * 10) / 10 } : { text: l.trim(), seconds: 0 }
  })
  const fixed = parsed.filter((p) => p.seconds > 0)
  if (fixed.length === 0) return { shots: evenShots(lines, totalSeconds), userSet: false }
  const open = parsed.filter((p) => p.seconds === 0)
  if (open.length === 0) return { shots: parsed, userSet: true }
  const left = Math.max(open.length, Math.round(totalSeconds - totalOf(fixed)))
  const each = Math.floor(left / open.length)
  let seen = 0
  return {
    shots: parsed.map((p) => (p.seconds > 0 ? p : { text: p.text, seconds: ++seen === open.length ? left - each * (open.length - 1) : each })),
    userSet: false,
  }
}

/** A shot as the strip holds it: its words, and its length as typed ("" when the person left it to share the clip). */
export interface ShotRow {
  text: string
  seconds: string
}

/** The strip's rows from the prompt value, one shot per line. An empty value is one blank shot. */
export function parseShotRows(value: string): ShotRow[] {
  const lines = value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return [{ text: "", seconds: "" }]
  return lines.map((l) => {
    const m = LEAD.exec(l)
    return m ? { seconds: String(Number(m[1])), text: m[2]!.trim() } : { seconds: "", text: l }
  })
}

/** One line per shot that has words; the length goes first when the person set one and the maker reads lengths. */
export function serializeShotRows(rows: ShotRow[], withLength: boolean): string {
  return rows
    .filter((r) => r.text.trim())
    .map((r) => {
      const n = Number(r.seconds)
      return withLength && n > 0 ? `${n}s ${r.text.trim()}` : r.text.trim().replace(/\r?\n/g, " ")
    })
    .join("\n")
}
