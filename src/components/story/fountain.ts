/**
 * Screenplay text, in the open Fountain format (fountain.io), and the blocks the editor works with.
 *
 * The story keeps its script as Fountain text so it can be read, imported and exported by any screenwriting
 * tool. The editor turns that text into typed blocks (scene heading, action, character, parenthetical, dialogue,
 * transition, act, note) and back. Page length follows the industry rule of thumb: Courier 12 on US Letter,
 * about 55 lines a page, and a page is about a minute of film.
 */

export type BlockType = "scene" | "action" | "character" | "parenthetical" | "dialogue" | "transition" | "act" | "note"

export interface ScriptBlock {
  id: string
  type: BlockType
  text: string
}

export const BLOCK_LABEL: Record<BlockType, string> = {
  scene: "Scene",
  action: "What we see",
  character: "Who speaks",
  parenthetical: "Direction",
  dialogue: "What they say",
  transition: "Cut or fade",
  act: "Act",
  note: "Note",
}

/** The order Tab walks through when you change what a line is */
export const TAB_ORDER: BlockType[] = ["action", "character", "parenthetical", "dialogue", "transition", "scene"]

/** Where a block sits on the page, in characters (Courier 12 is ten characters to the inch), from the left margin. */
export const COLUMNS: Record<BlockType, { indent: number; width: number; align?: "right" }> = {
  scene: { indent: 0, width: 60 },
  action: { indent: 0, width: 60 },
  character: { indent: 22, width: 38 },
  parenthetical: { indent: 16, width: 20 },
  dialogue: { indent: 10, width: 35 },
  transition: { indent: 0, width: 60, align: "right" },
  act: { indent: 0, width: 60 },
  note: { indent: 0, width: 60 },
}

export const LINES_PER_PAGE = 55

let counter = 0
export const newId = () => `b${Date.now().toString(36)}${(counter++).toString(36)}`
export const makeBlock = (type: BlockType, text = ""): ScriptBlock => ({ id: newId(), type, text })

const SCENE_START = /^(int|ext|est|int\.?\/ext|i\/e)[. ]/i
const isUpper = (s: string) => s === s.toUpperCase() && /[A-Z]/.test(s)
/** What counts as a character cue: capitals, with an optional extension like (V.O.) or (CONT'D) */
const isCue = (line: string) => {
  const name = line.replace(/\s*\(.*?\)\s*$/, "").trim()
  return name.length > 0 && isUpper(name) && !/[a-z]/.test(name.replace(/\(.*\)/, ""))
}

/** Reads Fountain text into blocks. */
export function parseFountain(text: string): ScriptBlock[] {
  const blocks: ScriptBlock[] = []
  const chunks = text.replace(/\r\n?/g, "\n").split(/\n{2,}/)
  for (const raw of chunks) {
    const chunk = raw.replace(/^\n+|\n+$/g, "")
    if (!chunk.trim()) continue
    const lines = chunk.split("\n")
    const first = lines[0]!.trim()

    if (/^#+\s*/.test(first)) {
      blocks.push(makeBlock("act", first.replace(/^#+\s*/, "")))
    } else if (/^\[\[.*\]\]$/s.test(chunk.trim())) {
      blocks.push(makeBlock("note", chunk.trim().slice(2, -2).trim()))
    } else if (lines.length === 1 && (first.startsWith(".") && !first.startsWith(".."))) {
      blocks.push(makeBlock("scene", first.slice(1).trim().toUpperCase()))
    } else if (lines.length === 1 && SCENE_START.test(first)) {
      blocks.push(makeBlock("scene", first.toUpperCase()))
    } else if (lines.length === 1 && (first.startsWith(">") && !first.endsWith("<") || (isUpper(first) && /TO:$/.test(first)))) {
      blocks.push(makeBlock("transition", first.replace(/^>\s*/, "").toUpperCase()))
    } else if (first.startsWith("!")) {
      blocks.push(makeBlock("action", [first.slice(1), ...lines.slice(1)].join("\n")))
    } else if (first.startsWith("@") || (lines.length > 1 && isCue(first))) {
      blocks.push(makeBlock("character", first.replace(/^@/, "").toUpperCase()))
      let speech: string[] = []
      const flush = () => {
        if (speech.length) blocks.push(makeBlock("dialogue", speech.join("\n")))
        speech = []
      }
      for (const line of lines.slice(1)) {
        if (/^\(.*\)$/.test(line.trim())) {
          flush()
          blocks.push(makeBlock("parenthetical", line.trim().slice(1, -1)))
        } else speech.push(line)
      }
      flush()
    } else {
      blocks.push(makeBlock("action", chunk))
    }
  }
  return blocks
}

/** Writes blocks as Fountain text. Reading it back gives the same blocks. */
export function toFountain(blocks: ScriptBlock[]): string {
  const out: string[] = []
  let speech: string[] | null = null
  const closeSpeech = () => {
    if (speech && speech.length) {
      // A cue with nothing said yet needs the "@" or it would read as a line of action
      if (speech.length === 1 && !speech[0]!.startsWith("@")) speech[0] = "@" + speech[0]
      out.push(speech.join("\n"))
    }
    speech = null
  }
  for (const b of blocks) {
    const text = b.text.replace(/\s+$/g, "")
    switch (b.type) {
      case "character":
        closeSpeech()
        speech = [(isCue(text) ? "" : "@") + text.toUpperCase()]
        break
      case "parenthetical":
        if (!speech) speech = ["@UNNAMED"]
        speech.push(`(${text})`)
        break
      case "dialogue":
        if (!speech) speech = ["@UNNAMED"]
        speech.push(text || " ")
        break
      case "scene":
        closeSpeech()
        out.push((SCENE_START.test(text) ? "" : ".") + text.toUpperCase())
        break
      case "transition":
        closeSpeech()
        out.push((/TO:$/i.test(text) ? "" : ">") + text.toUpperCase())
        break
      case "act":
        closeSpeech()
        out.push(`# ${text}`)
        break
      case "note":
        closeSpeech()
        out.push(`[[${text}]]`)
        break
      default: {
        closeSpeech()
        // An action line in capitals would read as a character cue; "!" keeps it action
        out.push((isCue(text) && !text.includes("\n") ? "!" : "") + text)
      }
    }
  }
  closeSpeech()
  return out.join("\n\n") + (out.length ? "\n" : "")
}

const wrapLines = (text: string, width: number) =>
  (text || " ").split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / width)), 0)

export interface ScriptStats {
  pages: number
  lines: number
  words: number
  scenes: number
  /** Whole minutes of film, about one per page */
  minutes: number
}

/** Lines each block takes on the page, with the blank line before it. Acts and notes take none. */
export function blockLineCounts(blocks: ScriptBlock[]): number[] {
  return blocks.map((b, i) => {
    if (b.type === "act" || b.type === "note") return 0
    const joinsPrevious = (b.type === "dialogue" || b.type === "parenthetical") && i > 0
    return wrapLines(b.text, COLUMNS[b.type].width) + (joinsPrevious ? 0 : 1)
  })
}

/** Lines on the page for each block (with the blank line before it) give the page count. */
export function scriptStats(blocks: ScriptBlock[]): ScriptStats {
  let words = 0
  let scenes = 0
  const counts = blockLineCounts(blocks)
  const lines = counts.reduce((a, b) => a + b, 0)
  blocks.forEach((b) => {
    if (b.type === "act" || b.type === "note") return
    if (b.type === "scene") scenes++
    words += b.text.trim() ? b.text.trim().split(/\s+/).length : 0
  })
  const pages = Math.max(1, Math.ceil(lines / LINES_PER_PAGE))
  return { pages, lines, words, scenes, minutes: lines === 0 ? 0 : Math.max(1, Math.round(lines / LINES_PER_PAGE)) }
}

/** The page a block starts on, for the page marker */
export function pageOf(blocks: ScriptBlock[], index: number): number {
  return scriptStats(blocks.slice(0, index + 1)).pages
}

export interface ScriptScene {
  heading: string
  /** First action line after the heading */
  summary: string
  characters: string[]
  actions: string[]
}

/** The scenes of a script, with who speaks in them and what happens: the start of a shot list. */
export function scenesOf(blocks: ScriptBlock[]): ScriptScene[] {
  const scenes: ScriptScene[] = []
  let cur: ScriptScene | null = null
  for (const b of blocks) {
    if (b.type === "scene") {
      cur = { heading: b.text.trim(), summary: "", characters: [], actions: [] }
      scenes.push(cur)
    } else if (cur && b.type === "action" && b.text.trim()) {
      cur.actions.push(b.text.trim())
      if (!cur.summary) cur.summary = b.text.trim()
    } else if (cur && b.type === "character") {
      const name = b.text.replace(/\s*\(.*?\)\s*$/, "").trim()
      if (name && !cur.characters.includes(name)) cur.characters.push(name)
    }
  }
  return scenes
}

export const characterNames = (blocks: ScriptBlock[]): string[] =>
  [...new Set(blocks.filter((b) => b.type === "character").map((b) => b.text.replace(/\s*\(.*?\)\s*$/, "").trim()).filter(Boolean))]
