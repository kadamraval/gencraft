import * as React from "react"
import { ArrowLeft, ArrowRight, BookOpen, Lightbulb, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DOCS, searchDocs, type Article, type Block } from "@/lib/help/docs-content"
import { cn } from "@/lib/utils"

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        if ("p" in b) return <p key={i} className="text-sm leading-relaxed text-foreground/90">{b.p}</p>
        if ("steps" in b)
          return (
            <ol key={i} className="space-y-2">
              {b.steps.map((s, j) => (
                <li key={j} className="flex gap-3 text-sm leading-relaxed text-foreground/90">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-xs text-foreground">{j + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          )
        if ("tip" in b)
          return (
            <div key={i} className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-secondary/30 p-3">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs leading-relaxed text-foreground/90">{b.tip}</p>
            </div>
          )
        return (
          <ul key={i} className="space-y-1.5">
            {b.list.map((s, j) => (
              <li key={j} className="flex gap-2.5 text-sm leading-relaxed text-foreground/90">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        )
      })}
    </div>
  )
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-")

/** The documentation: contents and search on the left, the article in the middle, "On this page" on the right */
export function DocsView({ initial }: { initial?: string }) {
  const [id, setId] = React.useState(initial ?? DOCS[0]!.id)
  const [query, setQuery] = React.useState("")
  const scroller = React.useRef<HTMLDivElement>(null)
  const article: Article = DOCS.find((a) => a.id === id) ?? DOCS[0]!
  const hits = React.useMemo(() => searchDocs(query), [query])
  const groups = [...new Set(DOCS.map((a) => a.group))]
  const index = DOCS.indexOf(article)
  const prev = DOCS[index - 1]
  const next = DOCS[index + 1]

  const open = (a: Article, section?: string) => {
    setId(a.id)
    window.setTimeout(() => {
      if (section) document.getElementById(`doc-${slug(section)}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
      else scroller.current?.scrollTo({ top: 0 })
    }, 30)
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl overflow-hidden">
      <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border/40 p-3 no-scrollbar">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the docs" aria-label="Search the docs" className="h-8 pl-8 text-xs" />
        </div>
        {query.trim() ? (
          <div className="space-y-0.5">
            <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground">{hits.length} {hits.length === 1 ? "result" : "results"}</p>
            {hits.map((h) => (
              <Button key={`${h.article.id}-${h.section?.h ?? ""}`} type="button" variant="ghost" onClick={() => open(h.article, h.section?.h)} className="flex h-auto w-full flex-col items-start gap-0 whitespace-normal rounded-lg px-2 py-1.5 text-left font-normal">
                <span className="text-xs font-medium text-foreground">{h.article.title}</span>
                <span className="text-xs text-muted-foreground">{h.section ? h.section.h : h.article.summary}</span>
              </Button>
            ))}
          </div>
        ) : (
          groups.map((g) => (
            <div key={g} className="space-y-0.5">
              <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</p>
              {DOCS.filter((a) => a.group === g).map((a) => (
                <Button key={a.id} type="button" variant="ghost" onClick={() => open(a)} className={cn("h-8 w-full justify-start rounded-lg px-2 text-xs font-medium", a.id === article.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {a.title}
                </Button>
              ))}
            </div>
          ))
        )}
      </aside>

      <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto px-8 py-6 no-scrollbar">
        <article className="mx-auto w-full max-w-2xl space-y-8">
          <header className="space-y-2 border-b border-border/60 pb-6">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              Documentation · {article.group}
            </p>
            <h1 className="text-2xl font-bold leading-tight text-foreground">{article.title}</h1>
            <p className="text-sm text-muted-foreground">{article.summary}</p>
          </header>
          {article.sections.map((s) => (
            <section key={s.h} id={`doc-${slug(s.h)}`} className="scroll-mt-6 space-y-3">
              <h2 className="text-base font-semibold text-foreground">{s.h}</h2>
              <Blocks blocks={s.blocks} />
            </section>
          ))}
          <nav className="grid grid-cols-2 gap-3 border-t border-border/60 pt-6">
            {prev ? (
              <Button type="button" variant="outline" onClick={() => open(prev)} className="h-auto flex-col items-start gap-0.5 whitespace-normal rounded-xl px-4 py-3 text-left font-normal">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ArrowLeft className="h-3 w-3" /> Previous
                </span>
                <span className="text-xs font-semibold text-foreground">{prev.title}</span>
              </Button>
            ) : (
              <span />
            )}
            {next && (
              <Button type="button" variant="outline" onClick={() => open(next)} className="col-start-2 h-auto flex-col items-end gap-0.5 whitespace-normal rounded-xl px-4 py-3 text-right font-normal">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  Next <ArrowRight className="h-3 w-3" />
                </span>
                <span className="text-xs font-semibold text-foreground">{next.title}</span>
              </Button>
            )}
          </nav>
        </article>
      </div>

      <aside className="hidden w-52 shrink-0 overflow-y-auto border-l border-border/40 p-4 xl:block no-scrollbar">
        <p className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">On this page</p>
        <div className="space-y-0.5 border-l border-border/60">
          {article.sections.map((s) => (
            <Button key={s.h} type="button" variant="ghost" onClick={() => document.getElementById(`doc-${slug(s.h)}`)?.scrollIntoView({ behavior: "smooth", block: "start" })} className="h-7 w-full justify-start rounded-none px-3 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground">
              {s.h}
            </Button>
          ))}
        </div>
      </aside>
    </div>
  )
}
