import * as React from "react"
import { ImagePlus, Loader2, Sparkles, Tag, Type, X } from "lucide-react"
import { Field, Rows } from "@/components/ui/form-rows"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { describeExample, describerCandidates, fileToDataUrl, videoFrames } from "@/lib/elements/describe"
import { saveElement } from "@/lib/elements/store"
import { CATEGORY_LABEL, isReferenceCategory } from "@/lib/elements/types"
import type { ElementCategory, ElementItem } from "@/lib/elements/types"
import { isLiveProviderReady, getProviderApiKey } from "@/lib/providers/live-connectors"
import { useListedModels } from "@/lib/registry/store"
import { describePrice } from "@/lib/registry/types"
import { useMoney } from "@/lib/currency/currency"
import type { SettingsState } from "@/types"

interface Props {
  category: ElementCategory
  settings?: SettingsState
  onSaved: (item: ElementItem) => void
  onCancel: () => void
  onOpenSettings?: (tab?: string) => void
  /** Inside a window that already has the title and borders: only the labelled rows and the buttons */
  plain?: boolean
}

/**
 * One form for every category.
 *  - Character, location, product, prop: a name and the images. The images are the reference. A few words can be added
 *    (written, or described from the images by a vision model) and stand in for the pictures on a model that cannot take them.
 *  - Camera, light, style, effects: the words that get added to a prompt. Write them, or add an example image
 *    or clip and let a vision model from the user's own key describe it.
 */
export function ElementBuilder({ category, settings, onSaved, onCancel, onOpenSettings, plain }: Props) {
  const listed = useListedModels()
  const money = useMoney()
  const reference = isReferenceCategory(category)
  const [name, setName] = React.useState("")
  const [files, setFiles] = React.useState<File[]>([])
  const [text, setText] = React.useState("")
  const [origin, setOrigin] = React.useState<"written" | "described">("written")
  const [describer, setDescriber] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const imageInput = React.useRef<HTMLInputElement>(null)
  const exampleInput = React.useRef<HTMLInputElement>(null)

  const previews = React.useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  React.useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const candidates = React.useMemo(() => describerCandidates(listed, (p) => (settings ? isLiveProviderReady(p, settings) : false)), [listed, settings])
  const chosen = candidates.find((c) => c.id === describer) ?? candidates[0]

  const describeFile = async (file: File) => {
    if (!chosen || !settings) return
    setBusy(true)
    setError("")
    try {
      const images = file.type.startsWith("video") ? await videoFrames(file) : [await fileToDataUrl(file)]
      const phrase = await describeExample({
        category,
        images,
        record: chosen,
        apiKey: getProviderApiKey(chosen.provider as never, settings) ?? "",
      })
      if (!phrase) throw new Error("The model returned nothing. Try another model or write it yourself.")
      setText(phrase)
      setOrigin("described")
      if (!name.trim()) setName(file.name.replace(/\.[^/.]+$/, ""))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // A picture element can also be told in words, for a model that cannot take pictures: the words stand in for it
  const describeImages = async () => {
    if (!chosen || !settings || files.length === 0) return
    setBusy(true)
    setError("")
    try {
      const images = await Promise.all(files.slice(0, 3).map((f) => fileToDataUrl(f)))
      const phrase = await describeExample({ category, images, record: chosen, apiKey: getProviderApiKey(chosen.provider as never, settings) ?? "" })
      if (!phrase) throw new Error("The model returned nothing. Try another model or write it yourself.")
      setText(phrase)
      setOrigin("described")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const inWords = (
    <div className="space-y-1.5" data-testid="element-in-words">
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setOrigin("written")
        }}
        placeholder={`In words, e.g. ${category === "character" ? "a tall woman with short red hair and a green coat" : category === "location" ? "a narrow cobbled street at dusk" : "a matte black thermos with a steel lid"}`}
        aria-label="In words"
        className="min-h-16 resize-none rounded-lg border border-border/60 text-xs"
      />
      <div className="flex items-center gap-2">
        {candidates.length > 0 ? (
          <Button type="button" variant="secondary" size="sm" disabled={busy || files.length === 0} onClick={() => void describeImages()} className="h-8 gap-1.5 text-xs">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Describe from the images{chosen ? ` (${chosen.name})` : ""}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">To write it for you, add a Gemini, OpenAI or OpenRouter key.</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Optional. Used instead of the pictures when a model cannot take them, so it still counts.</p>
    </div>
  )

  const ready = name.trim().length > 0 && (reference ? files.length > 0 : text.trim().length > 0)

  const save = async () => {
    setBusy(true)
    setError("")
    try {
      const item = await saveElement({
        category,
        name,
        images: reference ? files : [],
        text,
        origin,
        describedBy: origin === "described" ? chosen?.name : undefined,
      })
      onSaved(item)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  if (plain) {
    return (
      <div className="space-y-0">
        <Rows>
          <Field icon={Tag} label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" className="h-9 text-sm font-semibold" />
          </Field>
          {reference ? (
            <>
            <Field icon={ImagePlus} label="Images" top>
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  {previews.map((src, i) => (
                    <div key={src} className="group relative aspect-square overflow-hidden rounded-lg border border-border/60">
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <Button type="button" variant="ghost" size="iconSm" aria-label="Remove image" onClick={() => setFiles((f) => f.filter((_, j) => j !== i))} className="absolute right-1 top-1 h-5 w-5 rounded-full bg-background/80 p-0 opacity-0 group-hover:opacity-100">
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="ghost" aria-label="Add images" onClick={() => imageInput.current?.click()} className="aspect-square h-auto rounded-lg border border-dashed border-border/80 bg-secondary/20">
                    <ImagePlus className="h-5 w-5 text-muted-foreground" />
                  </Button>
                  <Input
                    ref={imageInput}
                    type="file"
                    className="hidden"
                    multiple
                    accept="image/*"
                    onChange={(e) => {
                      const picked = Array.from(e.target.files ?? [])
                      e.target.value = ""
                      setFiles((f) => [...f, ...picked])
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Several angles help models keep it consistent. The images are sent as the reference.</p>
              </div>
            </Field>
            <Field icon={Type} label="In words" top>
              {inWords}
            </Field>
            </>
          ) : (
            <>
              <Field icon={Type} label="Words" top>
                <Textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value)
                    setOrigin("written")
                  }}
                  placeholder={`Added to the prompt, e.g. ${category === "camera" ? "slow dolly-in, low angle" : category === "light" ? "soft window light, gentle falloff" : category === "style" ? "watercolor, soft edges" : "fine dust in the air"}`}
                  className="min-h-20 resize-none rounded-lg border border-border/60 text-xs"
                />
              </Field>
              <Field icon={Sparkles} label="Describe" top>
                {candidates.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Select value={chosen?.id} onValueChange={setDescriber}>
                        <SelectTrigger aria-label="Vision model" className="h-8 min-w-0 flex-1 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {candidates.slice(0, 40).map((c) => (
                            <SelectItem key={c.id} value={c.id} className="text-xs">
                              {c.name} · {describePrice(c.price, money.format, c.modality)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => exampleInput.current?.click()} className="h-8 shrink-0 gap-1.5 text-xs">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        From an example
                      </Button>
                      <Input
                        ref={exampleInput}
                        type="file"
                        className="hidden"
                        accept="image/*,video/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          e.target.value = ""
                          if (f) void describeFile(f)
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{origin === "described" && chosen ? `Described by ${chosen.name}. Edit the words if needed.` : "Pick an image or clip and the model writes the words for you."}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    To describe an example, add a Gemini, OpenAI or OpenRouter key.{" "}
                    {onOpenSettings && (
                      <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => onOpenSettings("providers")}>
                        Open Providers
                      </Button>
                    )}
                  </p>
                )}
              </Field>
            </>
          )}
        </Rows>
        {error && <p className="pt-3 text-xs text-destructive">{error}</p>}
        <div className="-mx-5 -mb-4 mt-4 flex items-center justify-end gap-2 border-t border-border/60 bg-secondary/20 px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="h-8 text-xs">
            Back
          </Button>
          <Button type="button" size="sm" disabled={!ready || busy} onClick={() => void save()} className="h-8 px-4 text-xs font-semibold">
            Save
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 no-scrollbar">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">New {CATEGORY_LABEL[category].toLowerCase()}</span>
        <Button type="button" variant="ghost" size="icon" aria-label="Cancel" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-8 text-xs" />

      {reference ? (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {previews.map((src, i) => (
              <div key={src} className="group relative aspect-square overflow-hidden rounded-lg border border-border/60">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  aria-label="Remove image"
                  onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 h-5 w-5 rounded-full bg-background/80 p-0 opacity-0 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" onClick={() => imageInput.current?.click()} className="aspect-square h-auto rounded-lg border border-dashed border-border/80 bg-secondary/20">
                  <ImagePlus className="h-5 w-5 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add images. Several angles help models keep it consistent.</TooltipContent>
            </Tooltip>
            <Input
              ref={imageInput}
              type="file"
              className="hidden"
              multiple
              accept="image/*"
              onChange={(e) => {
                // Read the files before the input is cleared: a state update runs later and would find it empty
                const picked = Array.from(e.target.files ?? [])
                e.target.value = ""
                setFiles((f) => [...f, ...picked])
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">The images are sent as the reference when a model can take them.</p>
          {inWords}
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setOrigin("written")
            }}
            placeholder={`Words added to the prompt, e.g. ${category === "camera" ? "slow dolly-in, low angle" : category === "light" ? "soft window light, gentle falloff" : category === "style" ? "watercolor, soft edges" : "fine dust in the air"}`}
            className="min-h-20 rounded-lg border border-border/60"
          />
          <div className="flex items-center gap-2">
            {candidates.length > 0 ? (
              <>
                <Select value={chosen?.id} onValueChange={setDescriber}>
                  <SelectTrigger aria-label="Vision model" className="h-8 min-w-0 flex-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.slice(0, 40).map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.name} · {describePrice(c.price, money.format, c.modality)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => exampleInput.current?.click()} className="h-8 gap-1.5 text-xs">
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Describe example
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Pick an image or clip. The model above writes the words for you.</TooltipContent>
                </Tooltip>
                <Input
                  ref={exampleInput}
                  type="file"
                  className="hidden"
                  accept="image/*,video/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ""
                    if (f) void describeFile(f)
                  }}
                />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                To describe an example, add a Gemini, OpenAI or OpenRouter key.{" "}
                {onOpenSettings && (
                  <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => onOpenSettings("providers")}>
                    Open Providers
                  </Button>
                )}
              </p>
            )}
          </div>
          {origin === "described" && chosen && <p className="text-xs text-muted-foreground">Described by {chosen.name}. Edit it if needed.</p>}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="mt-auto flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={!ready || busy} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  )
}
