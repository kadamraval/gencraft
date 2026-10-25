import * as React from "react"
import { ArrowLeft, Check, Compass, ImagePlus, KeyRound, Link2, Pin, Search } from "lucide-react"
import { BlankState } from "@/components/ui/blank-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { isConnected } from "@/lib/integrations/composio"
import { appFetch } from "@/lib/registry/net"
import type { CardSizeStep, LayoutMode, SettingsState } from "@/types"
import { BoardsTab } from "./boards-tab"
import type { UseRequest } from "./boards-tab"

/** A picture as data, so any provider can take it as a reference. When the address cannot be read from here, the address itself is used. */
async function asData(url: string): Promise<string> {
  try {
    const res = await appFetch(url)
    if (!res.ok) return url
    const blob = await res.blob()
    return await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : url)
      reader.onerror = () => resolve(url)
      reader.readAsDataURL(blob)
    })
  } catch {
    return url
  }
}

interface Props {
  settings: SettingsState
  onOpenSettings: (tab: "integrations") => void
  /** Sends pictures to the Create composer as references */
  onUse: (req: { prompt: string; id: string; name: string; imageUrl?: string; images?: Array<{ id: string; name: string; url: string }> }) => void
  layoutMode: LayoutMode
  cardSizeStep: CardSizeStep
  projectId: string
}

/**
 * Inspiration is your Pinterest boards, laid out like the Library. One row on top (the title, with a Back
 * after a search, and the search of your own pins). View is in the header.
 */
export function InspirationView({ settings, onOpenSettings, onUse, layoutMode, cardSizeStep, projectId }: Props) {
  const [message, setMessage] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [text, setText] = React.useState("")
  const [, bump] = React.useReducer((n: number) => n + 1, 0)

  // Connecting happens in Settings: look again when the window is used again
  React.useEffect(() => {
    window.addEventListener("focus", bump)
    return () => window.removeEventListener("focus", bump)
  }, [])

  const key = settings.aiEngine.composioApiKey ?? ""
  const connected = Boolean(key) && isConnected("pinterest")

  const say = (m: string) => {
    setMessage(m)
    window.setTimeout(() => setMessage((cur) => (cur === m ? null : cur)), 3500)
  }

  const use = async (req: UseRequest) => {
    const images = await Promise.all(req.images.map(async (i) => ({ ...i, url: await asData(i.url) })))
    onUse({ prompt: req.prompt, id: req.id, name: req.name, images })
  }

  const back = search
    ? () => {
        setSearch("")
        setText("")
      }
    : null

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {message && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 z-20 flex max-w-md -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground shadow-lg">
          <Check className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
          <span>{message}</span>
        </div>
      )}
      <div className="flex items-center gap-3 px-8 pb-2 pt-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {back ? (
            <Button type="button" variant="ghost" size="iconSm" aria-label="Back" onClick={back} className="h-8 w-8 flex-shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : (
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-card">
              <Compass className="h-4 w-4" />
            </span>
          )}
          <h1 className="truncate text-sm font-semibold text-foreground">{search ? `Pins matching "${search}"` : "Inspiration"}</h1>
        </div>
        {connected && (
          <form
            className="relative w-full max-w-64"
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim()) setSearch(text.trim())
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search my pins, then Enter" aria-label="Search my pins" className="h-8 pl-8 text-xs" />
          </form>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {connected ? (
          <BoardsTab apiKey={key} view={{ layoutMode, cardSizeStep }} projectId={projectId} search={search} onUse={(r) => void use(r)} onSaved={say} />
        ) : (
          <div className="h-full overflow-y-auto px-8 pb-8">
            <BlankState
              art={{ icon: Pin }}
              title="Pinterest boards"
              line="Your saved pins, ready to use as reference images."
              steps={[
                { icon: KeyRound, title: "Add your Composio key", text: "In Settings, Integrations. It stays on this device." },
                { icon: Link2, title: "Connect Pinterest", text: "Sign in once in your browser. Nothing else is shared." },
                { icon: ImagePlus, title: "Pick a pin", text: "Add it to your Library, or use it as a reference in Create." },
              ]}
              action={
                <Button type="button" size="sm" onClick={() => onOpenSettings("integrations")}>
                  Open Settings, Integrations
                </Button>
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}
