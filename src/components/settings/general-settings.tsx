import * as React from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { resetSetup } from "@/lib/home/onboarding"
import type { SettingsState } from "@/types"
import { AppearanceCard } from "./appearance-card"
import { BackupSettings } from "./backup-settings"
import { AppUpdateSettings } from "./app-updates"
import { ModelUpdateSettings } from "./model-updates"
import { LicenseCard } from "./general-cards"
import { PacksSettings } from "./packs-settings"
import { ModelsSection } from "./model-routing"
import { ProfileCard } from "./profile-card"
import { RegionCurrencyControls } from "./region-currency"
import { CleanupLines, Line, RunLimitLines, SpendLines, VoiceSettings } from "./voice-limits"

interface Props {
  settings: SettingsState
  onChange: (settings: SettingsState) => void
}

/** One accordion row: the title and its settings. Every row inside uses the same surface. */
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <AccordionItem value={id} className="rounded-xl border border-border bg-card last:border-b">
      <AccordionTrigger className="items-center px-4 py-3 text-sm font-semibold text-foreground hover:no-underline">{title}</AccordionTrigger>
      <AccordionContent className="space-y-2 px-4">{children}</AccordionContent>
    </AccordionItem>
  )
}

export function GeneralSettings({ settings, onChange }: Props) {
  const ai = settings.aiEngine
  const set = (patch: Partial<SettingsState["aiEngine"]>) => onChange({ ...settings, aiEngine: { ...ai, ...patch } })

  return (
    <div className="space-y-2">
      {/* Who you are and how the app looks: always visible, not in the accordion */}
      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <ProfileCard settings={settings} onChange={onChange} />
          <AppearanceCard />
        </div>
        <Line title="Country and currency" hint="Only changes how prices are shown">
          <RegionCurrencyControls />
        </Line>
      </div>

    <Accordion type="single" collapsible className="space-y-2">
      <Section id="models" title="Models">
        <ModelsSection settings={settings} onChange={onChange} />
      </Section>

      <Section id="chat" title="Chat & Agent">
        <div className="space-y-2 rounded-xl border border-border bg-secondary px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-foreground">About you</p>
            <p className="text-xs text-muted-foreground">Your work and how you like answers. Sent with every chat and agent run.</p>
          </div>
          <Textarea
            value={ai.chatInstructions ?? ""}
            onChange={(e) => set({ chatInstructions: e.target.value })}
            rows={3}
            maxLength={1500}
            placeholder="I run a skincare brand in Mumbai. Keep answers short and simple."
            aria-label="About you"
            className="min-h-20 resize-y border border-input bg-background/60 focus-visible:border-select/60 focus-visible:bg-background"
          />
        </div>
        <Line title="Search the web" hint="Chat can use current pages and show its sources">
          <Switch checked={ai.chatWebSearch === true} onCheckedChange={(on) => set({ chatWebSearch: on })} aria-label="Search the web" />
        </Line>
        <Line title="Approve the plan first" hint="The agent shows its plan and waits for your yes">
          <Switch checked={ai.agentApprovePlan !== false} onCheckedChange={(on) => set({ agentApprovePlan: on })} aria-label="Approve the plan first" />
        </Line>
      </Section>

      <Section id="create" title="Create">
        <Line title="Improve short prompts" hint="Adds light, camera or style to a short prompt. Your words stay.">
          <Switch checked={ai.improvePrompts !== false} onCheckedChange={(on) => set({ improvePrompts: on })} aria-label="Improve short prompts" />
        </Line>
        <Line title="Safety filter" hint="Keep the provider's safety checker on">
          <Switch checked={ai.bypassSafetyChecker !== true} onCheckedChange={(on) => set({ bypassSafetyChecker: !on })} aria-label="Safety filter" />
        </Line>
        <VoiceSettings settings={settings} onChange={onChange} />
      </Section>

      <Section id="spend" title="Spending & limits">
        <SpendLines settings={settings} onChange={onChange} />
        <RunLimitLines settings={settings} onChange={onChange} />
      </Section>

      <Section id="model-updates" title="Updates">
        <AppUpdateSettings />
        <ModelUpdateSettings />
      </Section>

      <Section id="setup" title="Welcome setup">
        <Line title="Run setup again" hint="Choose Free or Paid, then profile, first project, provider keys, a drive and the save folder. The app reloads.">
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              resetSetup()
              window.location.reload()
            }}
          >
            Run setup
          </Button>
        </Line>
      </Section>

      <Section id="storage" title="Storage & backup">
        <BackupSettings settings={settings} />
        <CleanupLines settings={settings} onChange={onChange} />
      </Section>

      <Section id="packs" title="Content packs">
        <PacksSettings />
      </Section>

      <Section id="license" title="License">
        <LicenseCard />
      </Section>
    </Accordion>
    </div>
  )
}
