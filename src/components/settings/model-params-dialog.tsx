import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { labelOf } from "@/components/composer/schema-form"
import { PROVIDERS } from "@/lib/registry/providers"
import { standardRun } from "@/lib/registry/price"
import { profileFor } from "@/lib/models/profile"
import "@/lib/models/profiles"
import type { ModelRecord, ParamProperty } from "@/lib/registry/types"

/**
 * Every setting a model takes, as the Create composer will offer it. What the provider lists is shown as listed.
 * What only the maker documents is marked untested until a run shows the provider takes it.
 */

type Tier = NonNullable<ParamProperty["tier"]> | "none"

const GROUPS: Array<{ tier: Tier[]; title: string; hint: string }> = [
  { tier: ["common"], title: "Standard", hint: "In the composer row" },
  { tier: ["unique"], title: "Model specific", hint: "What sets this model apart" },
  { tier: ["advanced", "none"], title: "More", hint: "Under More in the composer" },
  { tier: ["technical"], title: "Technical", hint: "The provider's low-level settings, under More" },
]

const ROLE: Record<string, string> = {
  start: "Start frame",
  end: "End frame",
  reference: "Reference",
  source: "Source",
  element: "Elements",
}

const label = labelOf

/** The values a setting takes, in a few words: the choices, a range, or on and off. */
export function describeValues(p: ParamProperty): string {
  if (p.enum?.length) {
    const shown = p.enum.slice(0, 6).join(" · ")
    return p.enum.length > 6 ? `${shown} · +${p.enum.length - 6}` : shown
  }
  if (p.type === "boolean") return "on · off"
  if ((p.type === "number" || p.type === "integer") && p.minimum !== undefined && p.maximum !== undefined) return `${p.minimum} to ${p.maximum}`
  if (p.type === "number" || p.type === "integer") return "number"
  return "text"
}

function Status({ p }: { p: ParamProperty }) {
  if (p.rejected) return <span className="rounded-full border border-destructive/40 px-1.5 text-xs text-destructive">Not accepted</span>
  if (p.untested) {
    const from = p.listedBy ? `${PROVIDERS.find((x) => x.id === p.listedBy)?.label ?? p.listedBy} lists it for this model` : "The maker documents it"
    return (
      <span title={`${from}, but this provider does not list it yet. It is sent only once you change it, and a real run settles whether it works.`} className="rounded-full border border-amber-500/40 px-1.5 text-xs text-amber-600 dark:text-amber-400">
        Untested
      </span>
    )
  }
  return null
}

function Row({ name, p }: { name: string; p: ParamProperty }) {
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-baseline gap-3 py-1.5" title={p.description}>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground">{label(name, p)}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{name}</p>
      </div>
      <p className="min-w-0 text-xs text-muted-foreground">
        {describeValues(p)}
        {p.default !== undefined && p.default !== "" && <span className="ml-2 text-foreground/70">default {String(p.default)}</span>}
      </p>
      <Status p={p} />
    </div>
  )
}

const TIER_WORD = { official: "The maker's own page", host: "The provider's list", "third-party": "A third party" } as const

/** What the maker says about the model that a provider's list cannot: price for a standard run, rules, how to prompt it, where each fact came from. */
function MakerNotes({ model }: { model: ModelRecord }) {
  const profile = profileFor(model)
  const run = model.modality === "text" ? undefined : standardRun(model)
  const rules = profile?.rules.map((r) => r.reason).filter((r, i, all) => all.indexOf(r) === i) ?? []
  const limits = profile?.inputs
    ? [
        limit("pictures", profile.inputs.images),
        limit("videos", profile.inputs.videos),
        limit("audio clips", profile.inputs.audios),
        profile.inputs.total ? `${profile.inputs.total} files together` : "",
      ].filter(Boolean)
    : []
  return (
    <>
      {run && run.estimate.usd !== null && (
        <section>
          <h4 className="text-xs font-semibold text-foreground">Price</h4>
          <p className="text-xs text-muted-foreground">
            {run.estimate.display}
            {run.label ? ` for ${run.label}` : ""}
            {run.estimate.breakdown ? `. ${run.estimate.breakdown}` : ""}
          </p>
        </section>
      )}
      {limits.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold text-foreground">What you can give it</h4>
          <p className="text-xs text-muted-foreground">Up to {limits.join(", ")}.</p>
        </section>
      )}
      {rules.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold text-foreground">What the maker sets</h4>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}
      {profile && profile.recipe.tips && profile.recipe.tips.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold text-foreground">Getting a good result</h4>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {profile.recipe.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h4 className="text-xs font-semibold text-foreground">Where this comes from</h4>
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {profile?.sources.map((s) => (
            <li key={s.url} className="break-words">
              {TIER_WORD[s.tier]}, read {s.read}: <span className="font-mono">{s.url.replace(/^https?:\/\//, "")}</span>
              {s.note ? ` (${s.note})` : ""}
            </li>
          ))}
          <li>{profile ? "Settings and files below are the provider's own list." : "No maker page has been captured for this model, so everything here is the provider's own list."}</li>
        </ul>
      </section>
    </>
  )
}

function limit(word: string, l?: { max: number; maxSeconds?: number; note?: string }): string {
  if (!l) return ""
  return `${l.max} ${word}${l.note ? ` (${l.note})` : l.maxSeconds ? ` (${l.maxSeconds} s each)` : ""}`
}

export function ModelParamsDialog({ model, onClose }: { model: ModelRecord | null; onClose: () => void }) {
  if (!model) return null
  const entries = Object.entries(model.params.properties)
  const files = entries.filter(([, p]) => p.format)
  const settings = entries.filter(([, p]) => !p.format)
  const provider = PROVIDERS.find((p) => p.id === model.provider)?.label ?? model.provider
  const untested = settings.filter(([, p]) => p.untested).length

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl gap-3">
        <DialogHeader>
          <DialogTitle className="text-base">{model.name} settings</DialogTitle>
          <DialogDescription>
            {settings.length} settings and {files.length} file inputs on {provider}
            {untested > 0 ? `, ${untested} untested` : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
          <MakerNotes model={model} />
          {files.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-foreground">Files it takes</h4>
              <div className="divide-y divide-border/40">
                {files.map(([key, p]) => (
                  <div key={key} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-baseline gap-3 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{ROLE[p.slot?.role ?? ""] ?? label(key, p)}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">{key}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p.format}
                      {p.slot ? (p.slot.list ? `, up to ${p.slot.max ?? "an unstated number"}` : ", one") : ""}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {GROUPS.map((g) => {
            const rows = settings.filter(([, p]) => g.tier.includes(p.tier ?? "none"))
            if (rows.length === 0) return null
            return (
              <section key={g.title}>
                <h4 className="flex items-baseline gap-2 text-xs font-semibold text-foreground">
                  {g.title}
                  <span className="font-normal text-muted-foreground">{g.hint}</span>
                </h4>
                <div className="divide-y divide-border/40">
                  {rows.map(([key, p]) => (
                    <Row key={key} name={key} p={p} />
                  ))}
                </div>
              </section>
            )
          })}
          {settings.length === 0 && <p className="text-xs text-muted-foreground">This provider lists no settings for the model. It runs with a prompt.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
