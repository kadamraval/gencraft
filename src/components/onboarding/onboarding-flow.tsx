import * as React from "react"
import { Check, FolderOpen, KeyRound, Loader2, Lock, ShieldCheck, Sparkles, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PinInput } from "@/components/ui/pin-input"
import { ProviderKeyBar } from "@/components/settings/provider-key-bar"
import { getAccountProvider } from "@/lib/account/provider"
import { readSession, writeSession } from "@/lib/account/session"
import type { AccountSession } from "@/lib/account/session"
import { isCode, isEmail, isPassword, isPin } from "@/lib/account/validate"
import { hasPassword, markUnlocked, setPin as savePin } from "@/lib/auth/lock"
import { chooseFolder, canChooseFolder, shownFolder } from "@/lib/backup/folder"
import { HAS_PAID_CODE, IS_BETA } from "@/lib/edition"
import { readSetup, SETUP_STEPS, writeSetup } from "@/lib/home/onboarding"
import type { Plan, SetupStep } from "@/lib/home/onboarding"
import { useLicense } from "@/lib/license"
import { PROVIDERS } from "@/lib/registry/providers"
import type { SettingsState } from "@/types"
import { OnboardingArt } from "./onboarding-art"
import { OnboardingShell, StepCard } from "./onboarding-shell"
import { PricingPage } from "./pricing-page"
import type { PlanChoice } from "./pricing-page"

/**
 * The first screens a new person sees, kept short and alike: sign up (verify by email; signing in is for someone who reinstalled), a PIN that
 * the app asks for each time it opens, pricing, and one quick setup screen. Until the account service is connected the stand-in provider lets
 * the person continue as a guest and the screen says so. "Run setup again" in Settings brings it back.
 */

const STEP_LABELS: Record<SetupStep, string> = { account: "Account", pin: "PIN", plan: "Plan", setup: "Setup", done: "Done" }
const STEPS = SETUP_STEPS.map((id) => ({ id, label: STEP_LABELS[id] }))
const SKIPPABLE: SetupStep[] = ["pin", "setup"]

const ROW = "flex items-center gap-3 text-xs"
const ROW_ICON = "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground"

interface Props {
  settings: SettingsState
  onSaveSettings: (settings: SettingsState) => void
  onFinish: () => void
}

export function OnboardingFlow({ settings, onSaveSettings, onFinish }: Props) {
  const [state, setState] = React.useState(() => readSetup())
  const license = useLicense()
  const provider = getAccountProvider()
  const plan: Plan = state.plan === "paid" && !HAS_PAID_CODE ? "free" : state.plan
  const step: SetupStep = SETUP_STEPS.includes(state.step) ? state.step : "account"
  const at = SETUP_STEPS.indexOf(step)

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
  const [term, setTerm] = React.useState<"year" | "lifetime">("lifetime")
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

  const choice: PlanChoice = plan === "paid" ? term : "free"
  const choose = (c: PlanChoice) => {
    setError(null)
    if (c === "free") return go("plan", { plan: "free" })
    setTerm(c)
    go("plan", { plan: "paid" })
  }

  const needsAccountForm = !session && provider.accounts
  const accountReady = !needsAccountForm || (awaitingCode ? isCode(code) : isEmail(email) && isPassword(pass))
  const pinReady = pin === "" || (isPin(pin) && pin === pin2)
  const ready = step === "account" ? accountReady : step === "pin" ? pinReady : true

  const submitAccount = async () => {
    if (!needsAccountForm) {
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
    if (pin === "" || hasPassword()) return forward()
    setBusy(true)
    setError(null)
    try {
      await savePin(pin)
      markUnlocked(true)
      forward()
    } finally {
      setBusy(false)
    }
  }

  const activate = async () => {
    setBusy(true)
    setError(null)
    try {
      if (await provider.activateKey(key)) setKey("")
      else setError("That key is not valid. Check it and try again.")
    } finally {
      setBusy(false)
    }
  }

  const saveName = () => {
    const general = { ...settings.general, profileName: name.trim() || settings.general.profileName }
    onSaveSettings({ ...settings, general })
  }

  const onMain = () => {
    if (step === "account") return void submitAccount()
    if (step === "pin") return void submitPin()
    if (step === "plan" && plan === "paid" && license.plan !== "paid") setState(writeSetup({ plan: "free" }))
    if (step === "setup") saveName()
    if (step === "done") return finish()
    forward()
  }

  const keysSaved = PROVIDERS.filter((p) => ((settings.aiEngine[p.keyField] as string | undefined) ?? "").trim() !== "").length
  const selectedProvider = PROVIDERS.find((p) => p.id === providerId) ?? PROVIDERS[0]!

  const copy: Record<SetupStep, { title: string; line: string }> = {
    account:
      mode === "login" && needsAccountForm
        ? { title: "Welcome back", line: "Log in once to restore your account on this device." }
        : awaitingCode
          ? { title: "Check your email", line: `We sent a 6-digit code to ${email.trim()}.` }
          : { title: "Welcome to Gencraft", line: "Make images, video, voice and finished stories with your own provider keys." },
    pin: { title: "Lock Gencraft with a PIN", line: "Optional. Gencraft asks for it every time it opens. You can change or remove it in Settings." },
    plan: { title: "Choose your plan", line: "Free is open source. Paid is one plan with two ways to pay, and the same features either way." },
    setup: { title: "Quick setup", line: "Your name and one provider key. Everything else can wait." },
    done: { title: "You are all set", line: "Here is what is ready. You can change any of it in Settings." },
  }

  const mainLabel =
    step === "done"
      ? "Open Gencraft"
      : step === "account"
        ? !needsAccountForm
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
    <OnboardingShell
      steps={STEPS}
      at={at}
      title={copy[step].title}
      line={copy[step].line}
      note={step === "account" && IS_BETA ? "Beta: features may change. Please report problems." : undefined}
      art={step !== "plan" ? <OnboardingArt step={step} /> : undefined}
      wide={step === "plan"}
      canSkipSetup={step !== "done" && step !== "account"}
      onSkipSetup={finish}
      onBack={back}
      skipLabel={SKIPPABLE.includes(step) ? "Skip" : undefined}
      onSkip={forward}
      mainLabel={mainLabel}
      mainDisabled={!ready}
      busy={busy}
      onMain={onMain}
    >
      {step === "account" && (
        <StepCard>
          {session ? (
            <p className={ROW}>
              <span className={ROW_ICON}>
                <Check className="h-4 w-4 text-primary" />
              </span>
              {session.guest ? "Continuing as a guest." : `Signed in as ${session.email}.`}
            </p>
          ) : !provider.accounts ? (
            <p className={ROW}>
              <span className={ROW_ICON}>
                <ShieldCheck className="h-4 w-4" />
              </span>
              <span className="text-muted-foreground">Accounts are not open in this beta yet. Everything works on this device without one, and nothing is sent anywhere.</span>
            </p>
          ) : awaitingCode ? (
            <div className="space-y-3">
              <PinInput value={code} onChange={setCode} mask={false} label="Verification code" autoFocus invalid={Boolean(error)} />
              <p className="text-center text-xs text-muted-foreground">Enter the code from your email.</p>
            </div>
          ) : (
            <>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" className="h-10 text-sm" autoFocus />
              <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Password (at least 8 characters)" aria-label="Password" className="h-10 text-sm" />
              <p className="text-center text-xs text-muted-foreground">
                {mode === "signup" ? "Already have an account, for example after a reinstall? " : "New to Gencraft? "}
                <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => setMode(mode === "signup" ? "login" : "signup")}>
                  {mode === "signup" ? "Log in" : "Sign up"}
                </Button>
              </p>
            </>
          )}
        </StepCard>
      )}

      {step === "pin" && (
        <StepCard>
          {hasPassword() ? (
            <p className={ROW}>
              <span className={ROW_ICON}>
                <Lock className="h-4 w-4" />
              </span>
              A lock is already set on this device.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-center text-xs font-medium text-muted-foreground">Choose a 6-digit PIN</p>
                <PinInput value={pin} onChange={setPin} label="PIN" autoFocus />
              </div>
              {pin.length === 6 && (
                <div className="space-y-2">
                  <p className="text-center text-xs font-medium text-muted-foreground">Type it again</p>
                  <PinInput value={pin2} onChange={setPin2} label="Repeat PIN" autoFocus invalid={pin2.length === 6 && pin2 !== pin} />
                  {pin2.length === 6 && pin2 !== pin && (
                    <p role="alert" className="text-center text-xs text-destructive">
                      The two PINs are different.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </StepCard>
      )}

      {step === "plan" && (
        <PricingPage choice={choice} onChoose={choose} paidAvailable={HAS_PAID_CODE}>
          {HAS_PAID_CODE && (
            <StepCard className="mx-auto w-full max-w-xl">
              {license.plan === "paid" ? (
                <p className={ROW}>
                  <span className={ROW_ICON}>
                    <Check className="h-4 w-4 text-primary" />
                  </span>
                  Paid plan active{license.licensee ? ` for ${license.licensee}` : ""}.
                </p>
              ) : (
                <>
                  <p className={ROW}>
                    <span className={ROW_ICON}>
                      <KeyRound className="h-4 w-4" />
                    </span>
                    <span className="font-medium">Have a licence key? Enter it to unlock Paid.</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Licence key" aria-label="Licence key" className="h-10 text-sm" />
                    <Button type="button" className="h-10 min-w-24" disabled={!key.trim() || busy} onClick={() => void activate()}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activate"}
                    </Button>
                  </div>
                  {plan === "paid" && !provider.canBuy && <p className="text-xs text-muted-foreground">Buying inside the app opens with accounts. Until then, continue on Free and add your key here or in Settings later.</p>}
                </>
              )}
            </StepCard>
          )}
        </PricingPage>
      )}

      {step === "setup" && (
        <StepCard>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" className="h-10 text-sm" />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Provider">
            {PROVIDERS.map((p) => (
              <Button key={p.id} type="button" size="sm" variant={providerId === p.id ? "secondary" : "outline"} aria-pressed={providerId === p.id} onClick={() => setProviderId(p.id)}>
                {p.label}
              </Button>
            ))}
          </div>
          <ProviderKeyBar provider={selectedProvider} settings={settings} onSave={onSaveSettings} />
          <p className={ROW}>
            <span className={ROW_ICON}>
              <FolderOpen className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{folder?.label ?? "Looking for the save folder..."}</span>
            {canChooseFolder() && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void chooseFolder().then(() => shownFolder().then(setFolder))}>
                Change
              </Button>
            )}
          </p>
        </StepCard>
      )}

      {step === "done" && (
        <StepCard>
          <ul className="space-y-3">
            <li className={ROW}>
              <span className={ROW_ICON}>
                <Sparkles className="h-4 w-4" />
              </span>
              {`Plan: ${license.plan === "paid" ? (license.term === "year" ? "Paid, One Year" : "Paid, Lifetime") : "Free"}`}
            </li>
            <li className={ROW}>
              <span className={ROW_ICON}>
                <UserRound className="h-4 w-4" />
              </span>
              {session && !session.guest ? `Signed in as ${session.email}` : settings.general.profileName ? `Hello, ${settings.general.profileName}` : "Guest"}
            </li>
            <li className={ROW}>
              <span className={ROW_ICON}>
                <Lock className="h-4 w-4" />
              </span>
              {hasPassword() ? "PIN on: asked every time the app opens" : "No PIN: set one any time in Settings"}
            </li>
            <li className={ROW}>
              <span className={ROW_ICON}>
                <KeyRound className="h-4 w-4" />
              </span>
              {keysSaved > 0 ? `${keysSaved} provider${keysSaved === 1 ? "" : "s"} connected` : "No provider key yet: add one in Settings, Providers"}
            </li>
            <li className={ROW}>
              <span className={ROW_ICON}>
                <FolderOpen className="h-4 w-4" />
              </span>
              <span className="min-w-0 truncate">{folder?.label ?? "Default folder"}</span>
            </li>
          </ul>
        </StepCard>
      )}

      {error && (
        <p role="alert" className="text-center text-xs text-destructive">
          {error}
        </p>
      )}
    </OnboardingShell>
  )
}
