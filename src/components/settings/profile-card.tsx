import * as React from "react"
import { Camera, User, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { shrinkImage } from "@/lib/brand/image"
import { PinInput } from "@/components/ui/pin-input"
import { hasPassword, isPinLock, markUnlocked, removePassword, setPin } from "@/lib/auth/lock"
import type { SettingsState } from "@/types"

interface Props {
  settings: SettingsState
  onChange: (settings: SettingsState) => void
}

/** Who is using the app: a picture, a name, an email, and the password that locks the app. */
export function ProfileCard({ settings, onChange }: Props) {
  const [password, setPassword] = React.useState("")
  const [current, setCurrent] = React.useState("")
  const [isSet, setIsSet] = React.useState(hasPassword)
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const general = settings.general
  const fileRef = React.useRef<HTMLInputElement>(null)
  // The old placeholder picture counts as no picture: without one, the first letter of the name is shown
  const picture = general.profileAvatarUrl && general.profileAvatarUrl !== "/author_avatar.png" ? general.profileAvatarUrl : ""
  const initial = (general.profileName ?? "").trim().charAt(0).toUpperCase()
  const setPicture = (url: string) => onChange({ ...settings, general: { ...general, profileAvatarUrl: url } })
  const pickPicture = async (file: File | undefined) => {
    if (!file) return
    try {
      setPicture(await shrinkImage(file, "photo"))
    } catch (e) {
      flash(e instanceof Error ? e.message : "That picture could not be opened.")
    }
  }

  const flash = (text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(""), 3500)
  }

  const savePin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length !== 6) return flash("Use exactly 6 digits.")
    if (isSet && !current) return flash("Type your current PIN first.")
    setBusy(true)
    const result = await setPin(password, current)
    setBusy(false)
    if (result === "wrong-current") return flash("The current PIN is not right.")
    if (result === "not-a-pin") return flash("Use exactly 6 digits.")
    setPassword("")
    setCurrent("")
    setIsSet(true)
    // Locked from now on, but this run of the app stays open
    markUnlocked(true)
    flash(isSet ? "PIN changed." : "PIN set. The app asks for it each time you open it.")
  }

  const dropPin = async () => {
    if (!current) return flash("Type your current PIN to remove it.")
    setBusy(true)
    const ok = await removePassword(current)
    setBusy(false)
    if (!ok) return flash("The current PIN is not right.")
    setCurrent("")
    setIsSet(false)
    flash("PIN removed. The app opens without one.")
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-secondary p-4">
      <div className="flex items-center gap-2">
        <User className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">Profile</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="group relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border border-border">
          {picture ? (
            <img src={picture} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary text-base font-semibold text-primary-foreground">{initial || <User className="h-4 w-4" />}</div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Change picture"
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 h-12 w-12 rounded-full bg-background/60 opacity-0 transition-opacity hover:bg-background/70 group-hover:opacity-100"
          >
            <Camera className="h-3.5 w-3.5" />
          </Button>
          <Input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Choose a picture" onChange={(e) => void pickPicture(e.target.files?.[0]).then(() => (e.target.value = ""))} />
        </div>
        {picture && (
          <Button type="button" variant="ghost" size="iconSm" aria-label="Remove picture" onClick={() => setPicture("")} className="h-6 w-6 flex-shrink-0 p-0 text-muted-foreground hover:text-destructive">
            <X className="h-3 w-3" />
          </Button>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <Input value={general.profileName || ""} onChange={(e) => onChange({ ...settings, general: { ...general, profileName: e.target.value } })} placeholder="Name" aria-label="Name" className="h-8 text-xs" />
          <Input type="email" value={general.profileEmail || ""} onChange={(e) => onChange({ ...settings, general: { ...general, profileEmail: e.target.value } })} placeholder="Email" aria-label="Email" className="h-8 text-xs" />
        </div>
      </div>

      <form onSubmit={savePin} className="space-y-2 border-t border-border/50 pt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">PIN · {isSet ? "On" : "Not set"}</span>
          {message && <span className="text-foreground">{message}</span>}
        </div>
        {isSet &&
          (isPinLock() ? (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Current PIN</span>
              <PinInput value={current} onChange={setCurrent} label="Current PIN" size="sm" className="justify-start" />
            </div>
          ) : (
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password (set before PINs)" aria-label="Current password" className="h-8 text-xs" />
          ))}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">{isSet ? "New PIN, 6 digits" : "PIN, 6 digits"}</span>
          <PinInput value={password} onChange={setPassword} label="New PIN" size="sm" className="justify-start" />
        </div>
        <div className="flex justify-end gap-2">
          {isSet && (
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" disabled={busy} onClick={dropPin}>
              Remove
            </Button>
          )}
          <Button type="submit" variant="secondary" size="sm" className="h-8 text-xs" disabled={password.length !== 6 || busy}>
            Save
          </Button>
        </div>
      </form>
    </div>
  )
}
