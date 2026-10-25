import * as React from "react"
import { Download, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IS_BETA } from "@/lib/edition"
import { APP_VERSION } from "@/lib/packs/store"
import { checkAppUpdate, getAppUpdateState, installAppUpdate, isDesktopApp, subscribeAppUpdate } from "@/lib/updates/app-update"
import { Line } from "./voice-limits"

/** The app's own version, and a way to look for and install a newer one (desktop app). */
export function AppUpdateSettings() {
  const [, force] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => subscribeAppUpdate(force), [])
  const [busy, setBusy] = React.useState<"check" | "install" | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const state = getAppUpdateState()
  const desktop = isDesktopApp()

  const run = async (kind: "check" | "install") => {
    setBusy(kind)
    setMessage(null)
    try {
      if (kind === "check") {
        const found = await checkAppUpdate()
        setMessage(found ? `Version ${found} is ready to install.` : "This is the newest version.")
      } else {
        await installAppUpdate()
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The update could not be checked.")
    } finally {
      setBusy(null)
    }
  }

  const hint = !desktop ? "This page is always the newest version." : (message ?? (state.version ? `Version ${state.version} is available.` : state.checkedAt ? "This is the newest version." : "Not checked yet."))

  return (
    <Line title={`Gencraft ${APP_VERSION}${IS_BETA ? " (beta)" : ""}`} hint={IS_BETA ? `${hint} Beta: features may change. Please report problems.` : hint}>
      <div className="flex items-center gap-2">
        {desktop && state.version && (
          <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy !== null} onClick={() => void run("install")}>
            {busy === "install" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Install and restart
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={!desktop || busy !== null} onClick={() => void run("check")}>
          {busy === "check" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Check now
        </Button>
      </div>
    </Line>
  )
}
