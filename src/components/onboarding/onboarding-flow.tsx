import * as React from "react"
import { ArrowLeft, ArrowRight, Check, FolderOpen, KeyRound, Loader2, Lock, Sparkles, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProviderKeyBar } from "@/components/settings/provider-key-bar"
import { getAccountProvider } from "@/lib/account/provider"
import { readSession, writeSession } from "@/lib/account/session"
import type { AccountSession } from "@/lib/account/session"
import { isCode, isEmail, isPassword, isPin } from "@/lib/account/validate"
import { hasPassword, markUnlocked, setPassword } from "@/lib/auth/lock"
import { chooseFolder, canChooseFolder, shownFolder } from "@/lib/backup/folder"
import { HAS_PAID_CODE, IS_BETA } from "@/lib/edition"
import { readSetup, SETUP_STEPS, writeSetup } from "@/lib/home/onboarding"
import type { Plan, SetupStep } from "@/lib/home/onboarding"
import { FREE_LIMITS, useLicense } from "@/lib/license"
import { PLAN_ROWS, PRICES } from "@/lib/plans"
import { PROVIDERS } from "@/lib/registry/providers"
import type { SettingsState } from "@/types"
import { cn } from "@/lib/utils"
import { OnboardingArt } from "./onboarding-art"

/**
 * The first screens a new person sees, kept short: sign up (verify by email, signed in once on this device), an optional PIN, pricing
 * (Free against Paid, side by side) and one quick setup screen. Until the account service is connected the stand-in provider lets the person
 * continue as a guest and the screen says so. "Run setup again" in Settings brings it back.
 */

const COPY: Record<SetupStep, { title: string; line: string }> = {
  account: { title: "Welcome to Gencraft", line: "Make images, video, voice and finished stories with your own provider keys." },
  pin: { title: "Lock Gencraft with a PIN?", line: "Optional. Gencraft asks for it each time it opens. You can change or remove it in Settings." },
  plan: { title: "Choose your plan", line: "Free is open source. Paid has the same price for the same features, once a year or for life." },
  setup: { title: "Quick setup", line: "Your name and one provider key. Everything else can wait." },
  done: { title: "You are all set", line: "Here is what is ready. You can change any of it in Settings." },
}

const SKIPPABLE: SetupStep[] = ["pin", "setup"]

interface Props {
  settings: SettingsState
  onSaveSettings: (settings: SettingsState) => void
  onFinish: () => void
}

type Term = keyof typeof PRICES

function PlanTable({ term }: { term: Term }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card text-xs">
      <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 border-b border-border bg-secondary/60 px-3 py-2 font-semibold">
        <span />
        <span>Free</span>
        <span>{`Paid · ${PRICES[term].label}`}</span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {PLAN_ROWS.map((row, i) => (
          <div key={`${row.main}-${row.sub}-${i}`} className={cn("grid grid-cols-[1.4fr_1fr_1fr] gap-2 px-3 py-1.5", row.main && i > 0 && "border-t border-border/60")}>
            <span className="min-w-0">
              {row.main && <span className="block font-medium text-foreground">{row.main}</span>}
              {row.sub && <span className="block truncate text-muted-foreground">{row.sub}</span>}
            </span>
            <span className={cn(row.free === "No" ? "text-muted-foreground" : "text-foreground")}>{row.free}</span>
            <span className="text-foreground">{row.paid}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function OnboardingFlow({ settings, onSaveSettings, onFinish }: Props) {
  const [state, setState] = React.useState(() => readSetup())
  const license = useLicense()
  const provider = getAccountProvider()
  const plan: Plan = state.plan === "paid" && !HAS_PAID_CODE ? "free" : state.plan
  const step: SetupStep = SETUP_STEPS.includes(state.step) ? state.step : "account"
  const at = SETUP_STEPS.indexOf(step)
  const copy = COPY[step]

  // sign up
  const [session, setSession] = React.useState<AccountSession | null>(() => readSession())
  const [mode, setMode] = React.useState<"signup" | "login">("signup")
  const [email, setEmail] = React.useState(settings.general.profileEmail ?? "")
  const [pass, setPass] = React.useState("")
  const [awaitingCode, setAwaitingCode] = React.useState(false)
  const [code, setCode] = React.useState("")
  // PIN
  const [pin, setPin] = React.useState("")
  const [pin2, setPin2] = React.useState("")
  // pricing
  const [term, setTerm] = React.useState<Term>("lifetime")
  const [key, setKey] = React.useState("")
  // setup
  const [name, setName] = React.useState(settings.general.profileName ?? "")
  const [providerId, setProviderId] = React.useState<(typeof PROVIDERS)[number]["id"]>(PROVIDERS[0]!.id)
  const [folder, setFolder] = React.useState<{ label: string; writable: boolean } | null>(null)

  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    void shownFolder().then(setFolder)
  }, [])

  const go = (next: SetupStep, patch: Partial<{ plan: Plan }> = {}) => {
    setError(null)
    setState(writeSetup({ step: next, ...patch }))
  }
  const forward = () => go(SETUP_STEPS[Math.min(at + 1, SETUP_STEPS.length - 1)]!)
  const back = () => go(SETUP_STEPS[Math.max(at - 1, 0)]!)
  const finish = () => {
    writeSetup({ done: true, step: "done" })
    onFinish()
  }

  const run = async (work: () => Promise<string | null>) => {
    setBusy(true)
    setError(null)
    try {
      const problem = await work()
      if (problem) setError(problem)
      else return true
    } finally {
      setBusy(false)
    }
    return false
  }

  // ---- what the main button does on each step, and whether it can
  const accountReady = session !== null || !provider.accounts || (awaitingCode ? isCode(code) : isEmail(email) && isPassword(pass))
  const pinReady = pin === "" || (isPin(pin) && pin === pin2)
  const ready = step === "account" ? accountReady : step === "pin" ? pinReady : !busy

  const submitAccount = async () => {
    if (session || !provider.accounts) {
      if (!session) setSession(writeSession({ guest: true }))
      return forward()
    }
    setBusy(true)
    setError(null)
    try {
      if (mode === "login") {
        const res = await provider.login(email.trim(), pass)
        if (!res.ok) return setError(res.message)
      } else if (!awaitingCode) {
        const res = await provider.signUp(email.trim(), pass)
        if (!res.ok) return setError(res.message)
        return setAwaitingCode(true)
      } else {
        const res = await provider.verify(email.trim(), code.trim())
        if (!res.ok) return setError(res.message)
      }
      setSession(writeSession({ email: email.trim(), guest: false }))
      onSaveSettings({ ...settings, general: { ...settings.general, profileEmail: email.trim() } })
      forward()
    } finally {
      setBusy(false)
    }
  }

  const submitPin = async () => {
    if (pin === "") return forward()
    setBusy(true)
    setError(null)
    try {
      await setPassword(pin)
      markUnlocked(true)
      forward()
    } finally {
      setBusy(false)
    }
  }

  const activate = async () => {
    const ok = await run(async () => ((await provider.activateKey(key)) ? null : "That key is not valid. Check it and try again."))
    if (ok) setKey("")
  }

  const saveName = () => {
    const general = { ...settings.general, profileName: name.trim() || settings.general.profileName }
    onSaveSettings({ ...settings, general })
  }

  const onContinue = () => {
    if (step === "account") return void submitAccount()
    if (step === "pin") return void submitPin()
    if (step === "plan" && plan === "paid" && license.plan !== "paid") setState(writeSetup({ plan: "free" }))
    if (step === "setup") saveName()
    if (step === "done") return finish()
    forward()
  }

  const keysSaved = PROVIDERS.filter((p) => ((settings.aiEngine[p.keyField] as string | undefined) ?? "").trim() !== "").length
  const selectedProvider = PROVIDERS.find((p) => p.id === providerId) ?? PROVIDERS[0]!

  const mainLabel =
    step === "done"
      ? "Open Gencraft"
      : step === "account"
        ? session || !provider.accounts
          ? "Continue as guest"
          : awaitingCode
            ? "Verify"
            : mode === "login"
              ? "Log in"
              : "Create account"
        : step === "plan"
          ? plan === "paid" && license.plan !== "paid"
            ? "Continue on Free for now"
            : "Continue"
          : step === "pin" && pin !== ""
            ? "Set PIN"
            : "Continue"

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="setup-title" className="fixed inset-0 z-[95] flex flex-col bg-background text-foreground">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card font-mono text-xs font-bold">GC</span>
          Gencraft
        </span>
        <div className="flex flex-1 items-center justify-center gap-1.5" aria-label={`Step ${at + 1} of ${SETUP_STEPS.length}`}>
          {SETUP_STEPS.map((s, i) => (
            <span key={s} className={cn("h-1.5 rounded-full transition-all", i === at ? "w-8 bg-primary" : i < at ? "w-4 bg-primary/60" : "w-4 bg-muted")} />
          ))}
        </div>
        {step !== "done" && step !== "account" ? (
          <Button type="button" variant="ghost" size="sm" onClick={finish}>
            Skip setup
          </Button>
        ) : (
          <span className="w-20" />
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className={cn("mx-auto flex min-h-full flex-col justify-center gap-5 py-2", step === "plan" ? "max-w-2xl" : "max-w-xl")}>
          {step !== "plan" && <OnboardingArt step={step} />}
          <div className="space-y-1 text-center">
            <h1 id="setup-title" className="text-xl font-semibold tracking-tight">
              {copy.title}
            </h1>
            <p className="text-sm text-muted-foreground">{copy.line}</p>
            {step === "account" && IS_BETA && <p className="text-xs text-muted-foreground">Beta: features may change. Please report problems.</p>}
          </div>

          {step === "account" && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              {session ? (
                <p className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary" />
                  {session.guest ? "Continuing as a guest." : `Signed in as ${session.email}.`}
                </p>
              ) : !provider.accounts ? (
                <p className="text-xs text-muted-foreground">Accounts are not open in this beta yet. Everything works on this device without one, and nothing is sent anywhere.</p>
              ) : awaitingCode ? (
                <>
                  <p className="text-xs text-muted-foreground">{`We sent a 6-digit code to ${email.trim()}. Enter it to verify your email.`}</p>
                  <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="6-digit code" aria-label="Verification code" className="h-9 text-xs" autoFocus />
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    {(["signup", "login"] as const).map((m) => (
                      <Button key={m} type="button" size="sm" variant={mode === m ? "secondary" : "ghost"} aria-pressed={mode === m} onClick={() => setMode(m)}>
                        {m === "signup" ? "Sign up" : "Log in"}
                      </Button>
                    ))}
                  </div>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" className="h-9 text-xs" autoFocus />
                  <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Password (at least 8 characters)" aria-label="Password" className="h-9 text-xs" />
                </>
              )}
            </div>
          )}

          {step === "pin" && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              {hasPassword() ? (
                <p className="flex items-center gap-2 text-sm">
                  <Lock className="h-4 w-4 text-primary" />A lock is already set on this device.
                </p>
              ) : (
                <>
                  <Input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="PIN, 4 to 6 digits" aria-label="PIN" className="h-9 text-xs" autoFocus />
                  {pin !== "" && <Input type="password" inputMode="numeric" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} placeholder="Type it again" aria-label="Confirm PIN" className="h-9 text-xs" />}
                  {pin !== "" && !pinReady && <p className="text-xs text-muted-foreground">{!isPin(pin) ? "Use 4 to 6 digits." : "The two PINs are different."}</p>}
                </>
              )}
            </div>
          )}

          {step === "plan" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Paid term">
                {(Object.keys(PRICES) as Term[]).map((t) => (
                  <Button key={t} type="button" size="sm" variant={term === t ? "secondary" : "outline"} aria-pressed={term === t} onClick={() => setTerm(t)}>
                    {`${PRICES[t].label} · $${PRICES[t].usd}`}
                  </Button>
                ))}
              </div>
              <PlanTable term={term} />
              <p className="text-center text-xs text-muted-foreground">{`Free: ${FREE_LIMITS.projects} project. Paid: ${PRICES[term].line}, same features either way.`}</p>
              <div className="flex gap-3">
                <Button type="button" variant="outline" aria-pressed={plan === "free"} onClick={() => go("plan", { plan: "free" })} className={cn("h-auto flex-1 flex-col items-start gap-1 p-3 text-left", plan === "free" && "border-primary bg-secondary")}>
                  <span className="text-sm font-semibold">Free</span>
                  <span className="text-xs font-normal text-muted-foreground">Open source, no payment</span>
                </Button>
                {HAS_PAID_CODE && (
                  <Button type="button" variant="outline" aria-pressed={plan === "paid"} onClick={() => go("plan", { plan: "paid" })} className={cn("h-auto flex-1 flex-col items-start gap-1 p-3 text-left", plan === "paid" && "border-primary bg-secondary")}>
                    <span className="text-sm font-semibold">{`Paid · ${PRICES[term].label}`}</span>
                    <span className="text-xs font-normal text-muted-foreground">{PRICES[term].line}</span>
                  </Button>
                )}
              </div>
              {!HAS_PAID_CODE && <p className="text-center text-xs text-muted-foreground">This community build runs on the Free plan.</p>}
              {HAS_PAID_CODE && plan === "paid" && (
                <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                  {license.plan === "paid" ? (
                    <p className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary" />
                      Paid plan active{license.licensee ? ` for ${license.licensee}` : ""}.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Licence key" aria-label="Licence key" className="h-9 text-xs" />
                        <Button type="button" size="sm" className="h-9 min-w-20" disabled={!key.trim() || busy} onClick={() => void activate()}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Activate"}
                        </Button>
                      </div>
                      {!provider.canBuy && <p className="text-xs text-muted-foreground">Buying inside the app opens with accounts. If you already have a key, enter it here; otherwise continue on Free for now.</p>}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {step === "setup" && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" className="h-9 text-xs" />
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Provider">
                {PROVIDERS.map((p) => (
                  <Button key={p.id} type="button" size="sm" variant={providerId === p.id ? "secondary" : "outline"} aria-pressed={providerId === p.id} onClick={() => setProviderId(p.id)}>
                    {p.label}
                  </Button>
                ))}
              </div>
              <ProviderKeyBar provider={selectedProvider} settings={settings} onSave={onSaveSettings} />
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <FolderOpen className="h-4 w-4 flex-shrink-0" />
                <span className="min-w-0 flex-1 truncate">{folder?.label ?? "Looking for the save folder..."}</span>
                {canChooseFolder() && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => void chooseFolder().then(() => shownFolder().then(setFolder))}>
                    Change
                  </Button>
                )}
              </p>
            </div>
          )}

          {step === "done" && (
            <ul className="space-y-2 rounded-xl border border-border bg-card p-4 text-xs">
              <li className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                {`Plan: ${license.plan === "paid" ? (license.term === "year" ? "Paid, One Year" : "Paid, Lifetime") : "Free"}`}
              </li>
              <li className="flex items-center gap-2">
                <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                {session && !session.guest ? `Signed in as ${session.email}` : settings.general.profileName ? `Hello, ${settings.general.profileName}` : "Guest"}
              </li>
              <li className="flex items-center gap-2">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                {keysSaved > 0 ? `${keysSaved} provider${keysSaved === 1 ? "" : "s"} connected` : "No provider key yet: add one in Settings, Providers"}
              </li>
              <li className="flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                {folder?.label ?? "Default folder"}
              </li>
            </ul>
          )}

          {error && (
            <p role="alert" className="text-center text-xs text-destructive">
              {error}
            </p>
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
          <Button type="button" size="lg" className="min-w-36 gap-1.5" disabled={!ready || busy} onClick={onContinue}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mainLabel}
            {!busy && <ArrowRight className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
