import * as React from "react"
import { ArrowRight, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { checkPassword } from "@/lib/auth/lock"

interface MasterPasswordGateProps {
  onUnlock: () => void
  isLocked: boolean
}

export function MasterPasswordGate({ onUnlock, isLocked }: MasterPasswordGateProps) {
  const [password, setPassword] = React.useState("")
  const [showPassword, setShowPassword] = React.useState(false)
  const [error, setError] = React.useState("")
  const [checking, setChecking] = React.useState(false)

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (checking) return
    setError("")
    setChecking(true)
    const ok = await checkPassword(password)
    setChecking(false)
    if (ok) {
      setPassword("")
      onUnlock()
    } else {
      setError("Incorrect password")
    }
  }

  if (!isLocked) return null

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background text-foreground px-6 select-none animate-fade-in">
      <div className="w-full max-w-xs p-6 rounded-2xl border border-border bg-card text-card-foreground text-center space-y-4">
        {/* Monogram */}
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-mono font-bold text-xs">
          GC
        </div>

        <div>
          <h1 className="text-sm font-semibold tracking-tight text-foreground">
            Gencraft
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Enter your password to open the studio
          </p>
        </div>

        <form onSubmit={handleUnlock} className="space-y-2.5">
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Password..."
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError("")
              }}
              className="h-8 pr-8 text-xs bg-secondary border-border text-foreground"
              autoFocus
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </Button>
          </div>

          {error && (
            <p className="text-xs text-destructive font-medium">
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="default"
            disabled={checking || !password}
            className="w-full h-8 text-xs gap-1"
          >
            <span>Unlock</span>
            <ArrowRight className="h-3 w-3" />
          </Button>
        </form>
      </div>
    </div>
  )
}
