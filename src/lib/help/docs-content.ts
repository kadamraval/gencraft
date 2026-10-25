/**
 * The documentation, as data so a page can list, search and link it. It is written once, as the user guide in docs-site/, and
 * scripts/build-help.mts turns it into help.generated.json, so the website and this Help say the same thing. Every article is a title, a
 * summary and sections of paragraphs, steps or tips.
 */
import generated from "./help.generated.json"
export type Block = { p: string } | { steps: string[] } | { tip: string } | { list: string[] }
export interface Section {
  h: string
  blocks: Block[]
}
export interface Article {
  id: string
  group: string
  title: string
  summary: string
  sections: Section[]
}

export const DOCS: Article[] = generated.DOCS as Article[]

export interface Hit {
  article: Article
  section?: Section
}

/** Articles whose title, summary or text contain every word typed */
export function searchDocs(query: string): Hit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return DOCS.map((article) => ({ article }))
  const text = (b: Block) => ("p" in b ? b.p : "steps" in b ? b.steps.join(" ") : "tip" in b ? b.tip : b.list.join(" "))
  return DOCS.flatMap((article) => {
    const head = `${article.title} ${article.summary}`.toLowerCase()
    if (words.every((w) => head.includes(w))) return [{ article }]
    const section = article.sections.find((s) => words.every((w) => `${s.h} ${s.blocks.map(text).join(" ")}`.toLowerCase().includes(w)))
    return section ? [{ article, section }] : []
  })
}

export const FAQ: Array<{ group: string; q: string; a: string }> = generated.FAQ
