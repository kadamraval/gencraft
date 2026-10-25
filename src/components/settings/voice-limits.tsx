import * as React from "react"
import { Input } from "@/components/ui/input"
import { MoneyInput } from "./money-input"
import { askOverUsd } from "@/lib/spend"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { formatSize, useLibraryBytes } from "@/lib/library/size"
import { DEFAULT_CONCURRENT_RUNS } from "@/lib/run-queue"
import { getProviderApiKey } from "@/lib/providers/live-connectors"
import { useListedModels } from "@/lib/registry/store"
import { OPENAI_STT_MODELS, OPENAI_VOICES, SPEECH_LANGUAGES } from "@/lib/voice/speech"
import type { SettingsState } from "@/types"

interface Props {
  settings: SettingsState
  onChange: (settings: SettingsState) => void
}

export function Line({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="pb-2 pt-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">{children}</h3>
}

const BROWSER = "browser"

/** Which model hears you, which one speaks back, and how a spoken request is handled. */
export function VoiceSettings({ settings, onChange }: Props) {
  const listed = useListedModels()
  const ai = settings.aiEngine
  const hasOpenAI = Boolean(getProviderApiKey("openai", settings))
  const hasGemini = Boolean(getProviderApiKey("gemini", settings))
  const geminiModels = listed.filter((m) => m.provider === "gemini" && m.modality === "text")
  const voiceModels = listed.filter((m) => m.provider === "openai" && m.modality === "audio")

  const sttValue = ai.speechToText ? `${ai.speechToText.provider}:${ai.speechToText.model}` : BROWSER
  const ttsValue = ai.textToSpeech ? `openai:${ai.textToSpeech.model}` : BROWSER
  const set = (patch: Partial<SettingsState["aiEngine"]>) => onChange({ ...settings, aiEngine: { ...ai, ...patch } })

  return (
    <div className="space-y-2">
      <Line title="Speech to text" hint="The model that hears you">
        <Select
          value={sttValue}
          onValueChange={(v) => {
            if (v === BROWSER) set({ speechToText: undefined })
            else {
              const [provider, ...rest] = v.split(":")
              set({ speechToText: { provider: provider as "openai" | "gemini", model: rest.join(":") } })
            }
          }}
        >
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={BROWSER} className="text-xs">
              Browser (built in)
            </SelectItem>
            {OPENAI_STT_MODELS.map((m) => (
              <SelectItem key={m} value={`openai:${m}`} disabled={!hasOpenAI} className="text-xs">
                OpenAI · {m}
                {!hasOpenAI ? " (add a key)" : ""}
              </SelectItem>
            ))}
            {geminiModels.map((m) => (
              <SelectItem key={m.id} value={`gemini:${m.endpoint}`} disabled={!hasGemini} className="text-xs">
                Gemini · {m.endpoint}
                {!hasGemini ? " (add a key)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Line>

      <Line title="Text to speech" hint="The model that speaks the reply">
        <Select
          value={ttsValue}
          onValueChange={(v) => {
            if (v === BROWSER) set({ textToSpeech: undefined })
            else set({ textToSpeech: { provider: "openai", model: v.slice("openai:".length), voice: ai.textToSpeech?.voice ?? OPENAI_VOICES[0]! } })
          }}
        >
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={BROWSER} className="text-xs">
              Browser voice
            </SelectItem>
            {voiceModels.map((m) => (
              <SelectItem key={m.id} value={`openai:${m.endpoint}`} disabled={!hasOpenAI} className="text-xs">
                OpenAI · {m.endpoint}
                {!hasOpenAI ? " (add a key)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {ai.textToSpeech && (
          <Select value={ai.textToSpeech.voice} onValueChange={(voice) => set({ textToSpeech: { ...ai.textToSpeech!, voice } })}>
            <SelectTrigger className="h-8 w-28 text-xs capitalize" aria-label="Voice">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPENAI_VOICES.map((v) => (
                <SelectItem key={v} value={v} className="text-xs capitalize">
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Line>

      <Line title="Language" hint="The language you speak">
        <Select value={ai.speechLanguage ?? "device"} onValueChange={(v) => set({ speechLanguage: v === "device" ? undefined : v })}>
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPEECH_LANGUAGES.map((l) => (
              <SelectItem key={l.id} value={l.id} className="text-xs">
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Line>

      <Line title="Clean up what I say" hint="Turns a spoken request into a clear prompt for images, video and audio">
        <Switch checked={ai.polishSpoken === true} onCheckedChange={(v) => set({ polishSpoken: v })} aria-label="Clean up what I say" />
      </Line>
    </div>
  )
}

/** A number box that means "no limit" when empty. */
export function Limit({ value, onChange, unit, ariaLabel, placeholder = "No limit", min = 0 }: { value: number | undefined; onChange: (v: number | undefined) => void; unit?: string; ariaLabel: string; placeholder?: string; min?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {unit === "$" && <span className="text-xs text-muted-foreground">$</span>}
      <Input
        type="number"
        min={min}
        value={value ?? ""}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => {
          const n = e.target.value === "" ? undefined : Math.max(min, Number(e.target.value))
          onChange(n === undefined || Number.isNaN(n) ? undefined : n)
        }}
        className="h-8 w-28 text-right text-xs"
      />
      {unit && unit !== "$" && <span className="w-10 text-xs text-muted-foreground">{unit}</span>}
    </div>
  )
}

type Limits = NonNullable<SettingsState["aiEngine"]["limits"]>

function useLimits({ settings, onChange }: Props) {
  const limits: Limits = settings.aiEngine.limits ?? {}
  const set = (patch: Partial<Limits>) => onChange({ ...settings, aiEngine: { ...settings.aiEngine, limits: { ...limits, ...patch } } })
  return { limits, set }
}

/** What may be spent. Empty means no limit. One "ask before" covers chat, pictures, video, audio and the agent. */
export function SpendLines({ settings, onChange }: Props) {
  const { limits, set } = useLimits({ settings, onChange })
  const ai = settings.aiEngine
  return (
    <div className="space-y-2">
      <Line title="Monthly budget" hint="Warns at 80% and stops runs at 100%">
        <MoneyInput optional usd={limits.monthlyBudgetUsd} onUsd={(v) => set({ monthlyBudgetUsd: v })} label="Monthly budget" />
      </Line>
      <Line title="Ask before anything over" hint="Chat, pictures, video, audio and the agent all wait for your yes above this">
        <MoneyInput optional usd={askOverUsd(ai)} onUsd={(v) => onChange({ ...settings, aiEngine: { ...ai, agentAutoApproveUsd: undefined, limits: { ...limits, confirmOverUsd: v } } })} label="Ask before anything over" />
      </Line>
      <Line title="Agent spend per run" hint="The agent stops making things when its estimate would pass this">
        <MoneyInput usd={ai.agentBudgetUsd ?? 2} onUsd={(v) => onChange({ ...settings, aiEngine: { ...ai, agentBudgetUsd: v ?? 2 } })} label="Agent spend per run" />
      </Line>
    </div>
  )
}

/** How much one run may do. */
export function RunLimitLines({ settings, onChange }: Props) {
  const { limits, set } = useLimits({ settings, onChange })
  return (
    <div className="space-y-2">
      <Line title="Runs at the same time" hint="More wait their turn, in the order you sent them">
        <Limit value={limits.maxConcurrent} onChange={(v) => set({ maxConcurrent: v === undefined ? undefined : Math.round(v) })} placeholder={String(DEFAULT_CONCURRENT_RUNS)} min={1} ariaLabel="Runs at the same time" />
      </Line>
      <Line title="Most results per run">
        <Limit value={limits.maxResults} onChange={(v) => set({ maxResults: v })} ariaLabel="Most results per run" />
      </Line>
      <Line title="Longest video">
        <Limit value={limits.maxVideoSeconds} onChange={(v) => set({ maxVideoSeconds: v })} unit="sec" ariaLabel="Longest video" />
      </Line>
    </div>
  )
}

/** What is kept on this device, and for how long. */
export function CleanupLines({ settings, onChange }: Props) {
  const { limits, set } = useLimits({ settings, onChange })
  const libraryBytes = useLibraryBytes()
  return (
    <div className="space-y-2">
      <Line title="Keep chats for">
        <Limit value={limits.keepHistoryDays} onChange={(v) => set({ keepHistoryDays: v })} unit="days" ariaLabel="Keep chats for" />
      </Line>
      <Line title="Delete failed runs after">
        <Limit value={limits.deleteFailedDays} onChange={(v) => set({ deleteFailedDays: v })} unit="days" ariaLabel="Delete failed runs after" />
      </Line>
      <Line title="Warn when the Library is over" hint={libraryBytes === null ? undefined : `Using ${formatSize(libraryBytes)} on this device now`}>
        <Limit value={limits.librarySizeWarnGb} onChange={(v) => set({ librarySizeWarnGb: v })} unit="GB" ariaLabel="Warn when the Library is over" />
      </Line>
    </div>
  )
}
