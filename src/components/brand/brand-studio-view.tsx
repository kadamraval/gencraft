import * as React from "react"
import { BrandLibrary, type NewKit } from "@/components/brand/brand-library"
import { BrandWorkspace } from "@/components/brand/brand-workspace"
import { blankKit, loadBrands, saveBrands } from "@/lib/brand/brand-storage"
import { useElements } from "@/lib/elements/store"
import type { SettingsState } from "@/types"
import type { BrandKit } from "@/types/brand"

interface BrandStudioViewProps {
  onSelectActiveBrand?: (brand: BrandKit) => void
  activeSubTab?: "brand" | "elements"
  onSubTabChange?: (tab: "brand" | "elements") => void
  settings?: SettingsState
  onOpenSettings?: (tab?: string) => void
  onGenerateText?: (prompt: string) => Promise<string>
}

/**
 * The Brand page. With no kit open it is the library (Brand kits and Elements). Opening a kit shows its workspace
 * with the Agent on the right. Kits are kept on this device after every change.
 */
export function BrandStudioView({ onSelectActiveBrand, activeSubTab = "brand", onSubTabChange, settings, onOpenSettings, onGenerateText }: BrandStudioViewProps) {
  const [kits, setKits] = React.useState<BrandKit[]>(() => loadBrands())
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(true)
  const elements = useElements().filter((e) => e.origin !== "preset")
  const open = kits.find((k) => k.id === openId) ?? null

  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setSaved(saveBrands(kits))
  }, [kits])

  // The kit being worked on is the one the rest of the app uses. Told once typing pauses.
  const announce = React.useRef(onSelectActiveBrand)
  announce.current = onSelectActiveBrand
  React.useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => announce.current?.(open), 600)
    return () => window.clearTimeout(t)
  }, [open])

  const create = (input: NewKit) => {
    const kit = blankKit(input)
    setKits((l) => [kit, ...l])
    setOpenId(kit.id)
  }

  if (open) {
    return (
      <BrandWorkspace
        key={open.id}
        kit={open}
        saved={saved}
        onChange={(next) => setKits((l) => l.map((k) => (k.id === next.id ? next : k)))}
        onBack={() => setOpenId(null)}
        onGenerateText={onGenerateText}
      />
    )
  }

  return (
    <BrandLibrary
      kits={kits}
      elements={elements}
      tab={activeSubTab}
      onTab={(t) => onSubTabChange?.(t)}
      onOpen={setOpenId}
      onCreate={create}
      onDelete={(id) => setKits((l) => l.filter((k) => k.id !== id))}
      settings={settings}
      onOpenSettings={onOpenSettings}
    />
  )
}
