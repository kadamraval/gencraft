import type { Brief } from "./blocks"
import type { AppSpec } from "./types"
import type { RegistryView } from "./validate"
import type { ModelRecord } from "@/lib/registry/types"

/**
 * What the studio's one agent needs to build an app. There is no second agent: these are three more tools beside the ones it
 * already has (ask_user and propose_plan are the studio's own), and a block of rules added to its instructions when the
 * person starts from Apps, Create new. The rules every app must follow are written here once, so every app is made the same way.
 */

export interface AppMeta {
  name: string
  icon: string
  color: string
}

/** What the agent can reach while building: the person's real models, the checker, and the app being drafted */
export interface AppEnv {
  /** The name, icon and color chosen in the dialog. Absent when no app is being built. */
  meta?: AppMeta
  /** An app being changed */
  existing?: AppSpec
  registry: RegistryView
  /** The models the person can use, best first */
  models: () => ModelRecord[]
  /** The latest draft that passed the checker */
  draft: () => AppSpec | undefined
  setDraft: (spec: AppSpec) => void
  /** Saves the app. Returns it as saved. */
  save: (spec: AppSpec) => AppSpec
  /** What the app makes and what the person gives it, as the agent wrote it down. Every draft is checked against it. */
  brief: () => Brief | undefined
  setBrief: (brief: Brief) => void
}
