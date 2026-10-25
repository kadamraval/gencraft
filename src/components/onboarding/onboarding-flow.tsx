import * as React from "react"
import { ArrowLeft, ArrowRight, Check, Cloud, FolderOpen, KeyRound, Loader2, Sparkles, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { IntegrationsPanel } from "@/components/settings/integrations-panel"
import { ProviderKeyBar } from "@/components/settings/provider-key-bar"
import { getAccountProvider } from "@/lib/account/provider"
import { chooseFolder, canChooseFolder, shownFolder } from "@/lib/backup/folder"
import { HAS_PAID_CODE, IS_BETA } from "@/lib/edition"
import { readSetup, stepsFor, writeSetup } from "@/lib/home/onboarding"
import type { Plan, SetupStep } from "@/lib/home/onboarding"
import { useLicense } from "@/lib/license"
import { PROVIDERS } from "@/lib/registry/providers"
import type { SettingsState } from "@/types"
import { cn } from "@/lib/utils"
import { OnboardingArt } from "./onboarding-art"

/**
 * The first screen a new person sees: choose Free or Paid, then a short guided setup (profile, first project, provider keys, a drive, the save
 * folder) and into the app. Free needs no account and no payment and keeps everything on this device. Paid adds an account step that, until the
 * BOSS service is connected, takes a licence key. Every step after the plan can be skipped; "Run setup again" in Settings brings it back.
 */

const COPY: Record<SetupStep, { title: string; line: string }> = {
  plan: { title: "Welcome to Gencraft", line: "Make images, video, voice and finished stories with your own provider keys. Start with the plan that suits you." },
  account: { title: "Your paid plan", line: "Paid is a one-time, lifetime plan. Sign in and activate it here." },
  profile: { title: "Who is making things?", line: "A name for the app to greet you with. Everything stays on this device." },
  project: { title: "Start your first project", line: "Projects keep your results together. You can add more any time." },
  keys: { title: "Connect your providers", line: "Paste a key for at least one provider. The app sends it only to that provider." },
  drive: { title: "Back up to a drive", line: "Connect Google Drive or Dropbox to keep a copy of what you make. You can do this later." },
  folder: { title: "Where should results go?", line: "Pick the folder where your images, video and audio are saved." },
  done: { title: "You are all set", line: "Here is what is ready. You can change any of it in Settings." },
}

const SKIPPABLE: SetupStep[] = ["profile", "project", "keys", "drive", "folder"]

interface Props {
  settings: SettingsState
  onSaveSettings: (settings: SettingsState) => void
  onCreateProject: (title: string) => void
  onFinish: () => void
}

function PlanCard({ selected, title, price, points, onPick }: { selected: boolean; title: string; price: string; points: string[]; onPick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      aria-pressed={selected}
      onClick={onPick}
      className={cn("h-auto flex-1 flex-col items-start gap-2 whitespace-normal p-4 text-left", selected && "border-primary bg-secondary")}
    >
      <span className="flex w-full items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        {selected && <Check className="h-4 w-4 text-primary" />}
      </span>
      <span className="text-xs text-muted-foreground">{price}</span>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </Button>
  )
}

export function OnboardingFlow({ settings, onSaveSettings, onCreateProject, onFinish }: Props) {
  const [state, setState] = React.useState(() => readSetup())
  const license = useLicense()
  const plan: Plan = state.plan === "paid" && !HAS_PAID_CODE ? "free" : state.plan
  const steps = stepsFor(plan)
  const step = steps.includes(state.step) ? state.step : "plan"
  const at = steps.indexOf(step)
  const copy = COPY[step]

  const [name, setName] = React.useState(settings.general.profileName ?? "")
  const [email, setEmail] = React.useState(settings.general.profileEmail ?? "")
  const [project, setProject] = React.useState("")
  const [made, setMade] = React.useState("")
  const [key, setKey] = React.useState("")
  const [checking, setChecking] = React.useState(false)
  const [keyError, setKeyError] = React.useState<string | null>(null)
  const [folder, setFolder] = React.useState<{ label: string; writable: boolean } | null>(null)

  React.useEffect(() => {
    void shownFolder().then(setFolder)
  }, [])

  const go = (next: SetupStep, patch: Partial<{ plan: Plan }> = {}) => setState(writeSetup({ step: next, ...patch }))
  const forward = () => go(steps[Math.min(at + 1, steps.length - 1)]!)
  const back = () => go(steps[Math.max(at - 1, 0)]!)
  const finish = () => {
    writeSetup({ done: true, step: "done" })
    onFinish()
  }

  const saveProfile = () => {
    const general = { ...settings.general, profileName: name.trim() || settings.general.profileName, profileEmail: email.trim() || settings.general.profileEmail }
    onSaveSettings({ ...settings, general })
  }

  const createProject = () => {
    const title = project.trim()
    if (title && title !== made) {
      onCreateProject(title)
      setMade(title)
    }
  }

  const activate = async () => {
    setChecking(true)
    setKeyError(null)
    try {
      const ok = await getAccountProvider().activateKey(key)
      if (!ok) setKeyError("That key is not valid. Check it and try again.")
    } finally {
      setChecking(false)
    }
  }

  const keysSaved = PROVIDERS.filter((p) => ((settings.aiEngine[p.keyField] as string | undefined) ?? "").trim() !== "").length

  const onContinue = () => {
    if (step === "profile") saveProfile()
    if (step === "project") createProject()
    if (step === "done") return finish()
    forward()
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="setup-title" className="fixed inset-0 z-[95] flex flex-col bg-background text-foreground">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card font-mono text-xs font-bold">GC</span>
          Gencraft
        </span>
        <div className="flex flex-1 items-center justify-center gap-1.5" aria-label={`Step ${at + 1} of ${steps.length}`}>
          {steps.map((s, i) => (
            <span key={s} className={cn("h-1.5 rounded-full transition-all", i === at ? "w-8 bg-primary" : i < at ? "w-4 bg-primary/60" : "w-4 bg-muted")} />
          ))}
        </div>
        {step !== "done" ? (
          <Button type="button" variant="ghost" size="sm" onClick={finish}>
            Skip setup
          </Button>
        ) : (
          <span className="w-20" />
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-5 py-2">
          <OnboardingArt step={step} />
          <div className="space-y-1 text-center">
            <h1 id="setup-title" className="text-xl font-semibold tracking-tight">
              {copy.title}
            </h1>
            <p className="text-sm text-muted-foreground">{copy.line}</p>
            {step === "plan" && IS_BETA && <p className="text-xs text-muted-foreground">Beta: features may change. Please report problems.</p>}
          </div>

          {step === "plan" && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <PlanCard
                selected={plan === "free"}
                title="Free"
                price="No account, no payment"
                points={["Images, video and audio from any model", "Library, Story and Edit, AI tools", "Built-in Apps", "Your files stay on this device"]}
                onPick={() => go("plan", { plan: "free" })}
              />
              {HAS_PAID_CODE && (
                <PlanCard
                  selected={plan === "paid"}
                  title="Paid, once for life"
                  price="Everything in Free, plus"
                  points={["The Agent that plans and makes for you", "Build your own Apps", "No limits on folders, skills or elements", "Support"]}
                  onPick={() => go("plan", { plan: "paid" })}
                />
              )}
            </div>
          )}
          {step === "plan" && !HAS_PAID_CODE && <p className="text-center text-xs text-muted-foreground">This community build runs on the Free plan.</p>}

          {step === "account" && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              {license.plan === "paid" ? (
                <p className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary" />
                  Paid plan active{license.licensee ? ` for ${license.licensee}` : ""}.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Licence key" aria-label="Licence key" className="h-9 text-xs" />
                    <Button type="button" size="sm" className="h-9 min-w-20" disabled={!key.trim() || checking} onClick={() => void activate()}>
                      {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Activate"}
                    </Button>
                  </div>
                  {keyError && <p className="text-xs text-destructive">{keyError}</p>}
                  {!getAccountProvider().canBuy && <p className="text-xs text-muted-foreground">Buying the lifetime plan inside the app opens soon. If you already have a key, enter it here.</p>}
                  <Button type="button" variant="ghost" size="sm" onClick={() => go("profile", { plan: "free" })}>
                    Continue on the Free plan for now
                  </Button>
                </>
              )}
            </div>
          )}

          {step === "profile" && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" className="h-9 text-xs" />
              {plan === "paid" && <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for your licence (optional)" aria-label="Email" className="h-9 text-xs" />}
            </div>
          )}

          {step === "project" && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <Input value={project} onChange={(e) => setProject(e.target.value)} placeholder="Project name, for example Summer campaign" aria-label="Project name" className="h-9 text-xs" />
              {made && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  Created {made}
                </p>
              )}
            </div>
          )}

          {step === "keys" && (
            <div className="space-y-2">
              {PROVIDERS.map((p) => (
                <ProviderKeyBar key={p.id} provider={p} settings={settings} onSave={onSaveSettings} />
              ))}
            </div>
          )}

          {step === "drive" && <IntegrationsPanel settings={settings} onSave={onSaveSettings} />}

          {step === "folder" && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <p className="flex items-center gap-2 text-xs">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{folder?.label ?? "Looking for the folder..."}</span>
              </p>
              {canChooseFolder() ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => void chooseFolder().then(() => shownFolder().then(setFolder))}>
                  Choose a different folder
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Your browser saves to its Downloads folder. The desktop app lets you choose any folder.</p>
              )}
            </div>
          )}

          {step === "done" && (
            <ul className="space-y-2 rounded-xl border border-border bg-card p-4 text-xs">
              <li className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                Plan: {license.plan === "paid" ? "Paid, once for life" : "Free"}
              </li>
              <li className="flex items-center gap-2">
                <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                {settings.general.profileName ? `Hello, ${settings.general.profileName}` : "No name set"}
              </li>
              <li className="flex items-center gap-2">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                {keysSaved > 0 ? `${keysSaved} provider${keysSaved === 1 ? "" : "s"} connected` : "No provider key yet: add one in Settings, Providers"}
              </li>
              <li className="flex items-center gap-2">
                <Cloud className="h-3.5 w-3.5 text-muted-foreground" />
                {made ? `Project: ${made}` : "No new project: you can start one any time"}
              </li>
              <li className="flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                {folder?.label ?? "Default folder"}
              </li>
            </ul>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3">
        <Button type="button" variant="ghost" size="sm" className={cn("gap-1.5", at === 0 && "invisible")} onClick={back}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          {SKIPPABLE.includes(step) && (
            <Button type="button" variant="ghost" size="sm" onClick={forward}>
              Skip
            </Button>
          )}
          <Button type="button" size="lg" className="min-w-36 gap-1.5" onClick={onContinue}>
            {step === "done" ? "Open Gencraft" : step === "plan" ? (plan === "paid" ? "Continue" : "Continue free") : "Continue"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
