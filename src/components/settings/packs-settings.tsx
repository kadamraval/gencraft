import * as React from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { getPackMeta, getSources, listAllPacks, refreshPacks, setPackEnabled, setSource, usePacksVersion } from "@/lib/packs/store"
import type { RefreshReport } from "@/lib/packs/store"
import type { Channel } from "@/lib/packs/types"
import { Line } from "./voice-limits"

const CHANNELS: Array<{ id: Channel; title: string; hint: string }> = [
  { id: "editor", title: "Editor content address", hint: "Effects, transitions, caption styles and text styles" },
  { id: "library", title: "Library content address", hint: "Elements and templates" },
]

const ago = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

/** The content packs: what is installed, which are on, where updates come from, and a check now. */
export function PacksSettings() {
  usePacksVersion()
  const [sources, setSources] = React.useState(getSources)
  const [busy, setBusy] = React.useState(false)
  const [reports, setReports] = React.useState<RefreshReport[]>([])
  const meta = getPackMeta()
  const packs = listAllPacks()

  const check = async () => {
    setBusy(true)
    try {
      setReports(await refreshPacks())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Effects, transitions, caption styles, elements and templates arrive as signed content packs, so new ones appear without a new version of the app.</p>
      {CHANNELS.map((c) => (
        <Line key={c.id} title={c.title} hint={meta.error[c.id] ?? (meta.lastChecked[c.id] ? `Checked ${ago(meta.lastChecked[c.id]!)}` : c.hint)}>
          <Input
            value={sources[c.id]}
            onChange={(e) => setSources((prev) => ({ ...prev, [c.id]: e.target.value }))}
            onBlur={() => setSource(c.id, sources[c.id])}
            placeholder="https://… (not set)"
            aria-label={c.title}
            className="h-8 w-64 text-xs"
          />
        </Line>
      ))}
      <Line title="Check for updates" hint={reports.length > 0 ? reports.map((r) => (r.error ? `${r.channel}: ${r.error}` : r.unchanged ? `${r.channel}: up to date` : `${r.channel}: ${r.added.length} updated`)).join(" · ") : "Also checked once a day"}>
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void check()} className="h-8 gap-1.5 text-xs">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Check now
        </Button>
      </Line>
      {packs.map(({ pack, builtIn, enabled, usable }) => (
        <Line key={pack.id} title={`${pack.title} · v${pack.version}`} hint={`${pack.items.length} ${pack.type.replace("-", " ")}${pack.items.length === 1 ? "" : "s"} · ${builtIn ? "built in" : "downloaded"}${usable ? "" : ` · needs app ${pack.minApp}`}`}>
          <Switch checked={enabled} disabled={!usable} onCheckedChange={(on) => setPackEnabled(pack.id, on)} aria-label={`Use ${pack.title}`} />
        </Line>
      ))}
    </div>
  )
}
