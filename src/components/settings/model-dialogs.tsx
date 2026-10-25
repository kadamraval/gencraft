import * as React from "react"
import { CircleHelp, Loader2, Play, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ResultAudio } from "@/components/agent/result-audio"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ErrorNotice } from "@/components/ui/error-notice"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { explainError } from "@/lib/errors/explain"
import { getProviderApiKey } from "@/lib/providers/live-connectors"
import { buildCustomModel } from "@/lib/registry/custom-models"
import type { NewModel } from "@/lib/registry/custom-models"
import { PROVIDERS, isRunnable } from "@/lib/registry/providers"
import { addCustomModel, isCustomModel, removeCustomModel, renameModel } from "@/lib/registry/store"
import { runModelTest, testCost } from "@/lib/registry/test-run"
import type { TestResult } from "@/lib/registry/test-run"
import type { ModelRecord, RegistryModality } from "@/lib/registry/types"
import type { SettingsState } from "@/types"

const KINDS: Array<{ id: RegistryModality; label: string }> = [
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "text", label: "Chat" },
]

const EXAMPLE: Record<string, string> = {
  fal: "fal-ai/flux/dev",
  replicate: "black-forest-labs/flux-schnell",
  openrouter: "anthropic/claude-sonnet-5.5",
  openai: "gpt-image-2",
  gemini: "gemini-3.8-flash",
}

/** Adds a model by its provider and id. Its settings are read from the provider where it publishes them. */
export function AddModelDialog({ open, onClose, settings, onAdded }: { open: boolean; onClose: () => void; settings: SettingsState; onAdded: (record: ModelRecord) => void }) {
  const [provider, setProvider] = React.useState<NewModel["provider"]>("fal")
  const [modelId, setModelId] = React.useState("")
  const [modality, setModality] = React.useState<RegistryModality>("image")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setError(null)
      setModelId("")
    }
  }, [open])

  // fal and OpenRouter say what a model makes; the others need telling
  const needsKind = provider !== "fal" && provider !== "openrouter"
  const hasKey = Boolean(getProviderApiKey(provider, settings))

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const record = await buildCustomModel({
        provider,
        modelId,
        modality,
        keys: { fal: getProviderApiKey("fal", settings) || undefined, replicate: getProviderApiKey("replicate", settings) || undefined },
      })
      if (!isRunnable(record.provider, record.modality)) throw new Error(`${record.provider} ${record.modality} models cannot be run from this app yet.`)
      addCustomModel(record)
      onAdded(record)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-4">
        <DialogHeader>
          <DialogTitle className="text-base">Add a model</DialogTitle>
          <DialogDescription>Enter the model's id from its provider.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Provider</label>
            <Select value={provider} onValueChange={(v) => setProvider(v as NewModel["provider"])}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Model id</label>
            <Input value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder={EXAMPLE[provider]} className="h-9 text-xs" />
          </div>
          {needsKind && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">What it makes</label>
              <Select value={modality} onValueChange={(v) => setModality(v as RegistryModality)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.filter((k) => isRunnable(provider, k.id)).map((k) => (
                    <SelectItem key={k.id} value={k.id} className="text-xs">
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!hasKey && <p className="text-xs text-muted-foreground">Add your {PROVIDERS.find((p) => p.id === provider)?.label} key first, so the model can run.</p>}
          {error && <ErrorNotice bare fallbackTitle="Could not add the model" message={error} />}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={busy || !modelId.trim()} onClick={() => void submit()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add model"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Rename a model, test it with one small run, or remove one you added. */
export function EditModelDialog({ model, onClose, settings }: { model: ModelRecord | null; onClose: () => void; settings: SettingsState }) {
  const [name, setName] = React.useState("")
  const [asking, setAsking] = React.useState(false)
  const [running, setRunning] = React.useState(false)
  const [result, setResult] = React.useState<TestResult | null>(null)
  const [failure, setFailure] = React.useState<ReturnType<typeof explainError> | null>(null)

  React.useEffect(() => {
    setName(model?.name ?? "")
    setResult(null)
    setFailure(null)
  }, [model?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!model) return null
  const cost = testCost(model)
  const custom = isCustomModel(model.id)

  const run = async () => {
    setAsking(false)
    setRunning(true)
    setResult(null)
    setFailure(null)
    try {
      setResult(await runModelTest(model.id, settings))
    } catch (e) {
      setFailure(explainError(e instanceof Error ? e.message : String(e), { provider: model.provider, model: model.name, hasSafetySwitch: Boolean(model.params.safety) }))
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md gap-4">
          <DialogHeader>
            <DialogTitle className="text-base">Edit model</DialogTitle>
            <DialogDescription className="truncate">{model.endpoint}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-xs" />
              <Button type="button" variant="secondary" size="sm" className="h-9" onClick={() => renameModel(model.id, name)}>
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-border/60 bg-secondary/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-foreground">Test this model</p>
                <p className="text-xs text-muted-foreground">One small run with your key{cost !== null ? `, about $${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}` : ""}.</p>
              </div>
              <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" disabled={running} onClick={() => setAsking(true)}>
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Test
              </Button>
            </div>
            {result?.kind === "image" && result.url && <img src={result.url} alt="" className="max-h-56 rounded-lg" />}
            {result?.kind === "video" && result.url && <video src={result.url} controls className="max-h-56 rounded-lg" />}
            {result?.kind === "audio" && result.url && <ResultAudio src={result.url} />}
            {result?.kind === "text" && <p className="rounded-lg bg-card p-2.5 text-xs text-foreground">{result.text}</p>}
            {result && <p className="text-xs text-emerald-600 dark:text-emerald-400">It works. {result.seconds} seconds.</p>}
            {failure && <ErrorNotice bare info={failure} fallbackTitle="The test failed" />}
          </div>

          {custom && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 self-start text-xs text-destructive"
              onClick={() => {
                removeCustomModel(model.id)
                onClose()
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove this model
            </Button>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={asking}
        neutral={{ icon: CircleHelp }}
        confirmLabel="Run the test"
        title="Run one test?"
        description={`This makes one small ${model.modality === "text" ? "reply" : model.modality} with ${model.name}${cost !== null ? `, estimated at about $${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}` : ", at a price that is not known"}. It is charged by ${model.provider}.`}
        onCancel={() => setAsking(false)}
        onConfirm={() => void run()}
      />
    </>
  )
}
