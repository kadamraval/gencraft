/**
 * Makes the in-app Help from the user guide, so the website and the app say the same thing and are written once.
 *
 *   npx tsx scripts/build-help.mts
 *
 * Reads docs-site/src/content/docs/guide/*.md and writes src/lib/help/help.generated.json ({ DOCS, FAQ }).
 *
 * A guide file has `title`, `description`, `id`, `group` and `order` in its front matter. In the body: `## ` starts a section; a numbered list
 * is steps; a bulleted list is a list; a line starting `> Tip:` is a tip; anything else is a paragraph. The file `faq.md` is the FAQ: `## ` is the
 * group, `### ` is a question and the paragraph under it is the answer. The help screen shows plain text, so the guide avoids other markdown.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"

const dir = "docs-site/src/content/docs/guide"
const out = "src/lib/help/help.generated.json"

type Block = { p: string } | { steps: string[] } | { tip: string } | { list: string[] }
interface Section {
  h: string
  blocks: Block[]
}
interface Article {
  id: string
  group: string
  title: string
  summary: string
  sections: Section[]
}

function frontMatter(text: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!m) throw new Error("A guide file has no front matter")
  const meta: Record<string, string> = {}
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z]+):\s*(.*)$/.exec(line)
    if (kv) meta[kv[1]!] = kv[2]!.replace(/^"(.*)"$/, "$1")
  }
  return { meta, body: text.slice(m[0].length) }
}

/** The blocks of one section, from its lines */
function blocksOf(lines: string[]): Block[] {
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === "") {
      i++
    } else if (/^\d+\.\s/.test(line)) {
      const steps: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i]!)) steps.push(lines[i++]!.replace(/^\d+\.\s/, ""))
      blocks.push({ steps })
    } else if (/^-\s/.test(line)) {
      const list: string[] = []
      while (i < lines.length && /^-\s/.test(lines[i]!)) list.push(lines[i++]!.replace(/^-\s/, ""))
      blocks.push({ list })
    } else if (/^>\s*Tip:\s*/i.test(line)) {
      blocks.push({ tip: line.replace(/^>\s*Tip:\s*/i, "") })
      i++
    } else {
      const para: string[] = []
      while (i < lines.length && lines[i]!.trim() !== "" && !/^(\d+\.|-)\s/.test(lines[i]!) && !/^>\s*Tip:/i.test(lines[i]!)) para.push(lines[i++]!)
      blocks.push({ p: para.join(" ") })
    }
  }
  return blocks
}

const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort()
const articles: Array<Article & { order: number }> = []
const faq: Array<{ group: string; q: string; a: string }> = []
for (const file of files) {
  const { meta, body } = frontMatter(readFileSync(`${dir}/${file}`, "utf8"))
  const lines = body.split(/\r?\n/)
  if (meta.id === "faq") {
    let group = ""
    let question = ""
    let answer: string[] = []
    const flush = () => {
      if (question) faq.push({ group, q: question, a: answer.join(" ").trim() })
      question = ""
      answer = []
    }
    for (const line of lines) {
      if (line.startsWith("### ")) {
        flush()
        question = line.slice(4).trim()
      } else if (line.startsWith("## ")) {
        flush()
        group = line.slice(3).trim()
      } else if (question && line.trim()) answer.push(line.trim())
    }
    flush()
    continue
  }
  if (!meta.id || !meta.group || !meta.title) throw new Error(`${file}: id, group and title are required`)
  const sections: Section[] = []
  let current: { h: string; lines: string[] } | undefined
  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (current) sections.push({ h: current.h, blocks: blocksOf(current.lines) })
      current = { h: line.slice(3).trim(), lines: [] }
    } else if (current) current.lines.push(line)
  }
  if (current) sections.push({ h: current.h, blocks: blocksOf(current.lines) })
  articles.push({ id: meta.id, group: meta.group, title: meta.title, summary: meta.description ?? "", sections, order: Number(meta.order ?? 100) })
}
articles.sort((a, b) => a.order - b.order)
const DOCS: Article[] = articles.map(({ order: _order, ...a }) => a)
writeFileSync(out, JSON.stringify({ DOCS, FAQ: faq }, null, 2) + "\n")
console.log(`help: ${DOCS.length} articles, ${faq.length} questions -> ${out}`)

// During the first conversion only: compare with the text the app had before
const old = "docs-site/.old-help.json"
if (existsSync(old)) {
  const before = JSON.parse(readFileSync(old, "utf8")) as { DOCS: Article[]; FAQ: unknown[] }
  const same = JSON.stringify(before.DOCS) === JSON.stringify(DOCS) && JSON.stringify(before.FAQ) === JSON.stringify(faq)
  console.log(same ? "identical to the previous in-app help" : "DIFFERENT from the previous in-app help")
}
