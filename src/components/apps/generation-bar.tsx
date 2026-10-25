import { ChevronDown, Volume2, VolumeX } from "lucide-react"
import { COUNT_KEYS, CountStepper, isRowParam, MoreMenu, ParamPill, ToggleParam, withOptions } from "@/components/chat/chat-input"
import { SchemaForm } from "@/components/composer/schema-form"
import { Button } from "@/components/ui/button"
import { FilterBadge } from "@/components/ui/filter-badge"
import { ModelLogo } from "@/components/ui/model-logo"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { audioSwitchKey } from "@/lib/registry/canonical"
import type { ModelRecord } from "@/lib/registry/types"
import { settingKeys } from "./setting-keys"

export interface BarStep {
  id: string
  title: string
  rec?: ModelRecord
  /** The settings as the model will be sent them (its defaults, the app's, the person's) */
  shown: Record<string, unknown>
  userSettings?: string[]
  /** Settings an input already controls, never listed here */
  controlled: string[]
}

interface Props {
  steps: BarStep[]
  picking: string | null
  onPick: (stepId: string) => void
  onSetting: (stepId: string, key: string, value: unknown) => void
}

/**
 * The generation options of an app, fixed at the bottom of its sidebar and drawn the way the composer draws them: the model
 * first, then the settings as chips (aspect ratio, how many, length, quality), and the rest behind the settings button. The
 * agent cannot move this: wherever an app generates something, this is where its options are.
 */
export function GenerationBar({ steps, picking, onPick, onSetting }: Props) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-2">
        {steps.map((step) => {
          const rec = step.rec
          const keys = rec ? settingKeys(rec.params, step.userSettings, step.controlled) : { main: [], more: [] }
          const row = rec ? keys.main.filter((k) => isRowParam(k, rec.params.properties[k]!)) : []
          const audioKey = rec ? audioSwitchKey(rec.params.properties) : undefined
          const rest = rec ? [...keys.main.filter((k) => !row.includes(k)), ...keys.more].filter((k) => k !== audioKey) : []
          return (
            <div key={step.id} className="space-y-1.5">
              {steps.length > 1 && <p className="text-xs font-medium text-muted-foreground">{step.title}</p>}
              <div className="flex flex-wrap items-center gap-1.5">
                <Button type="button" variant="pill" size="chip" aria-pressed={picking === step.id} onClick={() => onPick(step.id)} className="max-w-full flex-shrink-0 text-foreground">
                  {rec && <ModelLogo name={rec.name} endpoint={rec.endpoint} family={rec.family} provider={rec.provider} size={14} />}
                  <span className="max-w-40 truncate">{rec?.name ?? "Choose model"}</span>
                  {rec && <FilterBadge model={rec} />}
                  <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                </Button>
                {rec &&
                  row.map((key) => {
                    const prop = rec.params.properties[key]!
                    const set = (v: unknown) => onSetting(step.id, key, v)
                    return COUNT_KEYS.includes(key) ? (
                      <CountStepper key={key} prop={prop} value={step.shown[key]} onChange={set} />
                    ) : prop.type === "boolean" ? (
                      <ToggleParam key={key} name={key} prop={prop} value={step.shown[key]} onChange={set} />
                    ) : (
                      <ParamPill key={key} name={key} prop={withOptions(prop, step.shown[key])} value={step.shown[key]} onChange={set} />
                    )
                  })}
                {rec && audioKey && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="pill" size="chip" aria-pressed={Boolean(step.shown[audioKey])} aria-label="Generate audio" onClick={() => onSetting(step.id, audioKey, !step.shown[audioKey])} className="flex-shrink-0">
                        {step.shown[audioKey] ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
                        <span>Audio</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Audio</TooltipContent>
                  </Tooltip>
                )}
                {rec && rest.length > 0 && (
                  <MoreMenu>
                    <SchemaForm schema={rec.params} values={step.shown} only={rest} layout="rows" onChange={(k, v) => onSetting(step.id, k, v)} />
                  </MoreMenu>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
