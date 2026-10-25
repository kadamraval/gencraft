import * as React from "react"
import { BookOpen, Check, Clipboard, Globe, HelpCircle, LifeBuoy, Mail, Minus, MessagesSquare, PlayCircle, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FormCard, IconTile } from "@/components/ui/form-rows"
import { Input } from "@/components/ui/input"
import { FAQ } from "@/lib/help/docs-content"
import { SUPPORT_LINKS } from "@/lib/help/links"
import { isLiveProviderReady } from "@/lib/providers/live-connectors"
import { openExternal } from "@/lib/registry/net"
import { cn } from "@/lib/utils"
import type { MainNavTab, SettingsState } from "@/types"

interface Props {
  settings: SettingsState
  onNavigate: (tab: MainNavTab) => void
}

const PROVIDERS = ["fal", "replicate", "openrouter", "gemini", "openai"] as const

/** The facts a person at support would ask for. Never any key. */
function details(settings: SettingsState): string {
  const connected = PROVIDERS.filter((p) => isLiveProviderReady(p, settings))
  return [
    "Gencraft support details",
    `Time: ${new Date().toISOString()}`,
    `Window: ${"__TAURI_INTERNALS__" in window ? "desktop app" : "browser"}`,
    `System: ${navigator.userAgent}`,
    `Look: ${document.documentElement.classList.contains("dark") ? "dark" : "light"}`,
    `Providers with a key: ${connected.length ? connected.join(", ") : "none"}`,
  ].join("\n")
}

/** The help center: search, ways to reach a person, and the common questions */
export function SupportView({ settings, onNavigate }: Props) {
  const [query, setQuery] = React.useState("")
  const [open, setOpen] = React.useState<number | null>(0)
  const [copied, setCopied] = React.useState(false)
  const [group, setGroup] = React.useState<string>("All")
  const allGroups = [...new Set(FAQ.map((f) => f.group))]
  const q = query.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = FAQ.map((f, i) => ({ f, i })).filter(({ f }) => (group === "All" || f.group === group) && q.every((w) => `${f.q} ${f.a} ${f.group}`.toLowerCase().includes(w)))

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(details(settings))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard refused: nothing to do
    }
  }

  const contact = [
    { icon: Mail, title: "Email", text: "Write to us and we will reply.", link: SUPPORT_LINKS.email ? `mailto:${SUPPORT_LINKS.email}` : "", action: "Send an email" },
    { icon: Globe, title: "Send a request", text: "Open a support request on the web.", link: SUPPORT_LINKS.ticket, action: "Open a request" },
    { icon: MessagesSquare, title: "Community", text: "Ask other people who use the app.", link: SUPPORT_LINKS.community, action: "Join the community" },
  ]

  return (
    <div className="h-full w-full overflow-y-auto px-6 pb-24 pt-4 no-scrollbar">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-6 text-center">
          <IconTile icon={LifeBuoy} className="mx-auto h-10 w-10" />
          <div>
            <h1 className="text-lg font-bold leading-tight text-foreground">How can we help?</h1>
            <p className="text-xs text-muted-foreground">Search the answers below, read the guides, or reach a person.</p>
          </div>
          <div className="relative mx-auto max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions" aria-label="Search questions" className="h-9 pl-9 text-xs" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="ghost" onClick={() => onNavigate("docs")} className="flex h-auto items-center justify-start gap-3 whitespace-normal rounded-2xl border border-border/70 bg-card p-4 text-left font-normal hover:bg-secondary/30">
            <IconTile icon={BookOpen} />
            <span>
              <span className="block text-xs font-semibold text-foreground">Documentation</span>
              <span className="block text-xs text-muted-foreground">Step by step guides</span>
            </span>
          </Button>
          <Button type="button" variant="ghost" onClick={() => onNavigate("tutorials")} className="flex h-auto items-center justify-start gap-3 whitespace-normal rounded-2xl border border-border/70 bg-card p-4 text-left font-normal hover:bg-secondary/30">
            <IconTile icon={PlayCircle} />
            <span>
              <span className="block text-xs font-semibold text-foreground">Tutorials</span>
              <span className="block text-xs text-muted-foreground">Video courses</span>
            </span>
          </Button>
        </div>

        <FormCard icon={HelpCircle} title="Frequently asked questions" hint={shown.length === 0 ? "No match" : `${shown.length} ${shown.length === 1 ? "answer" : "answers"}`} bare>
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-4 py-2.5">
            {(["All", ...allGroups] as const).map((g) => (
              <Button key={g} type="button" variant="ghost" size="sm" onClick={() => setGroup(g)} className={cn("h-7 rounded-full border px-3 text-xs", group === g ? "border-select/60 bg-select/10 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground")}>
                {g}
              </Button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="p-8 text-center text-xs text-muted-foreground">Nothing matches that. Try another word, or contact us below.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {shown.map(({ f, i }) => {
                const on = open === i || q.length > 0
                return (
                  <div key={i} className={cn("transition-colors", on && "bg-secondary/20")}>
                    <Button type="button" variant="ghost" aria-expanded={on} onClick={() => setOpen(open === i ? null : i)} className="flex h-auto w-full items-center justify-start gap-3 whitespace-normal rounded-none px-4 py-3 text-left font-normal hover:bg-secondary/30">
                      <span className="min-w-0 flex-1 text-xs font-semibold leading-snug text-foreground">{f.q}</span>
                      {group === "All" && <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground">{f.group}</span>}
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border/70 text-muted-foreground">{on ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}</span>
                    </Button>
                    {on && <p className="mx-4 mb-3.5 border-l-2 border-primary/50 pl-3 text-xs leading-relaxed text-muted-foreground">{f.a}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </FormCard>

        <FormCard
          icon={LifeBuoy}
          title="Contact us"
          hint="Still need help? Send us your details with your message."
          bare
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => void copy()} className="h-7 gap-1.5 px-2.5 text-xs">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy details"}
            </Button>
          }
        >
          <div className="grid grid-cols-3 divide-x divide-border/60">
            {contact.map((c) => (
              <div key={c.title} className="flex flex-col gap-2 p-4">
                <IconTile icon={c.icon} />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-foreground">{c.title}</p>
                  <p className="text-xs leading-snug text-muted-foreground">{c.text}</p>
                </div>
                <Button type="button" variant="secondary" size="sm" disabled={!c.link} onClick={() => void openExternal(c.link)} className="h-7 self-start px-3 text-xs font-semibold">
                  {c.link ? c.action : "Coming soon"}
                </Button>
              </div>
            ))}
          </div>
        </FormCard>
      </div>
    </div>
  )
}
