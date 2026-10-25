import type { LanguageModel, ToolSet } from "ai"
import type { StudioEnv } from "@/lib/agent/types"

/**
 * The community build has no Agent: this stands in for the file of the same name in src/pro/ (the official app). Anything that tries to start the
 * agent gets a plain message instead.
 */
export type StudioTools = ToolSet
export type StudioAgent = never

export function createStudioAgent(_model: LanguageModel, _env: StudioEnv): StudioAgent {
  throw new Error("The Agent is part of the paid Gencraft plan and is not in the community build.")
}
