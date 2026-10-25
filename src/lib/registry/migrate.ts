import type { SettingsState } from "@/types"
import { getRecord, isWatchedModel } from "./store"

const REMOVED_KEY = "gencraft_removed_models_v1"

/** Models a setting pointed at that the app no longer offers. Shown once, so nothing disappears without a word. */
export function takeRemovedModels(): string[] {
  try {
    const raw = localStorage.getItem(REMOVED_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function dismissRemovedModels(): void {
  try {
    localStorage.removeItem(REMOVED_KEY)
  } catch {
    // nothing stored
  }
}

function rememberRemoved(ids: string[]) {
  if (ids.length === 0) return
  try {
    localStorage.setItem(REMOVED_KEY, JSON.stringify([...new Set([...takeRemovedModels(), ...ids])]))
  } catch {
    // the notice is a courtesy
  }
}

const KEYS = ["activeTextModelId", "activeImageModelId", "activeVideoModelId", "activeAudioModelId"] as const
const MODALITY_OF: Record<(typeof KEYS)[number], string> = {
  activeTextModelId: "text",
  activeImageModelId: "image",
  activeVideoModelId: "video",
  activeAudioModelId: "audio",
}

/**
 * Settings saved by an older version may point at models that no longer exist (GPT-4o, Veo 2, ...).
 * Those entries are cleared so Settings shows an empty slot to fill and the router picks a current default.
 */
export function migrateModelSettings(settings: SettingsState): SettingsState {
  const aiEngine = { ...settings.aiEngine }
  // Earlier builds shipped a placeholder key that made a fresh install look connected
  if (aiEngine.falApiKey === "fal_demo_key") aiEngine.falApiKey = ""
  const fallbackModels = { ...(aiEngine.fallbackModels ?? {}) }
  const removed: string[] = []
  for (const key of KEYS) {
    const id = aiEngine[key]
    if (id && (!getRecord(id) || !isWatchedModel(id))) {
      removed.push(id)
      aiEngine[key] = ""
    }
    const modality = MODALITY_OF[key]
    if (fallbackModels[modality]) fallbackModels[modality] = fallbackModels[modality]!.filter((fid) => Boolean(getRecord(fid)))
  }
  rememberRemoved(removed)
  return { ...settings, aiEngine: { ...aiEngine, fallbackModels } }
}
