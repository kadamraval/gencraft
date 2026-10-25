import * as React from "react"
import type { MediaAsset, SettingsState } from "@/types"

/**
 * What a place needs to run an AI tool, given once near the top of the app: the settings (keys and switched-on models), the project, where
 * a finished result is saved, and how to open Providers. A detail view anywhere reads it instead of being handed four props.
 */
export interface ToolHost {
  settings: SettingsState
  projectId?: string
  /** Saves finished results to the Library */
  onAssets: (assets: MediaAsset[]) => void
  onOpenSettings: () => void
}

const Ctx = React.createContext<ToolHost | null>(null)

export const ToolHostProvider = Ctx.Provider
export const useToolHost = () => React.useContext(Ctx)
