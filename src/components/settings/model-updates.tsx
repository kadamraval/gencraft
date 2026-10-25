import * as React from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FREQUENCIES, getLastUpdate, getUpdateFrequency, recordUpdate, setUpdateFrequency, subscribeUpdateSchedule } from "@/lib/knowledge/update-schedule"
import type { UpdateFrequency } from "@/lib/knowledge/update-schedule"
import { refreshKnowledge } from "@/lib/knowledge/store"
import { getLiveRecords, refreshRegistry } from "@/lib/registry/store"
import { PROVIDER_IDS } from "@/lib/registry/providers"
import type { RefreshProvider } from "@/lib/registry/store"
import { Line } from "./voice-limits"

const ago = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

/** How often the models, their prices and what each can do are read again, and a button to do it now. */
export function ModelUpdateSettings({ keys }: { keys?: () => { fal?: string; replicate?: string } }) {
  const [, force] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => subscribeUpdateSchedule(force), [])
  const [running, setRunning] = React.useState(false)
  const frequency = getUpdateFrequency()
  const last = getLastUpdate()

  const updateNow = async () => {
    setRunning(true)
    try {
      const known = getLiveRecords()
      const providers = (PROVIDER_IDS as readonly string[]).filter((p): p is RefreshProvider => ["fal", "openrouter", "openai", "gemini"].includes(p) && known.some((r) => r.provider === p))
      const [pack, registry] = await Promise.all([refreshKnowledge(), refreshRegistry({ providers: providers.length > 0 ? providers : undefined, keys: keys?.() })])
      const parts = [pack.taken ? "model database updated" : (pack.skipped ?? "model database is current"), registry.ok ? `${registry.added} new models, ${registry.deprecated} retired` : "provider lists not reachable"]
      recordUpdate(parts.join("; "))
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <Line title="Update models and prices" hint="How often the model lists, prices and abilities are read again">
        <Select value={frequency} onValueChange={(v) => setUpdateFrequency(v as UpdateFrequency)}>
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FREQUENCIES.map((f) => (
              <SelectItem key={f.value} value={f.value} className="text-xs">
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Line>
      <Line title="Update now" hint={last.at ? `Last update ${ago(last.at)}: ${last.note ?? ""}` : "Not updated on this device yet"}>
        <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" disabled={running} onClick={() => void updateNow()}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Update
        </Button>
      </Line>
    </>
  )
}
