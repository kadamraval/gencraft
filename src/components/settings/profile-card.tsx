import * as React from "react"
import { Camera, Eye, EyeOff, User, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { shrinkImage } from "@/lib/brand/image"
import { hasPassword, markUnlocked, removePassword, setPassword as saveMasterPassword } from "@/lib/auth/lock"
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
  const [show, setShow] = React.useState(false)
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

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 4) return flash("Use at least 4 characters.")
    if (isSet && !current) return flash("Type your current password first.")
    setBusy(true)
    const result = await saveMasterPassword(password, current)
    setBusy(false)
    if (result === "wrong-current") return flash("The current password is not right.")
    setPassword("")
    setCurrent("")
    setIsSet(true)
    // Locked from now on, but this run of the app stays open
    markUnlocked(true)
    flash(isSet ? "Password changed." : "Password set. The app asks for it each time you open it.")
  }

  const dropPassword = async () => {
    if (!current) return flash("Type your current password to remove it.")
    setBusy(true)
    const ok = await removePassword(current)
    setBusy(false)
    if (!ok) return flash("The current password is not right.")
    setCurrent("")
    setIsSet(false)
    flash("Password removed. The app opens without one.")
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

      <form onSubmit={savePassword} className="space-y-1.5 border-t border-border/50 pt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">Password · {isSet ? "On" : "Not set"}</span>
          {message && <span className="text-foreground">{message}</span>}
        </div>
        {isSet && <Input type={show ? "text" : "password"} value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" aria-label="Current password" className="h-8 text-xs" />}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" aria-label="New password" className="h-8 pr-8 text-xs" />
            <Button type="button" variant="ghost" size="icon" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((v) => !v)} className="absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground">
              {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </Button>
          </div>
          <Button type="submit" variant="secondary" size="sm" className="h-8 text-xs" disabled={!password || busy}>
            Save
          </Button>
          {isSet && (
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" disabled={busy} onClick={dropPassword}>
              Remove
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
