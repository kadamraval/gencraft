import type { AppEnv } from "@/lib/apps/app-types"
import type { AgentToolEnv } from "@/lib/ai-tools/agent-env"
import type { Ledger, SpendLimits } from "./policy"

/** The shapes the agent and the places that run it agree on. The agent itself is in src/pro/. */

/**
 * The studio's agent, on the Vercel AI SDK: a chat model that makes images, video and audio for a goal by calling tools.
 *
 *  - It proposes a plan first, and nothing is made until the person approves it (`propose_plan`).
 *  - A result under the auto-approve price just runs; a dearer one asks first; one past the budget is refused (`policy.ts`).
 *  - It can ask the person a question in the chat (`ask_user`), look at what was already made (`list_results`) and read
 *    a skill (`load_skill`).
 *  - The conversation is kept, so "make it darker" continues the work.
 *
 * The system text is short, skills appear only as a one line index, and a skill's method is read only when asked for.
 */

export type GenerateKind = "image" | "video" | "audio"

export interface GenerateArgs {
  prompt: string
  aspectRatio?: string
  seconds?: number
  count?: number
  /** Results made earlier, used as references for the same character or place */
  referenceIds?: string[]
  /** A brand kit whose logo is sent as a picture reference */
  brandId?: string
}

/** The older steps list: kept so conversations saved before the AI SDK still open. */
export interface AgentStep {
  id: string
  tool: string
  title: string
  state: "running" | "done" | "error"
  summary?: string
  assetIds?: string[]
}

export interface MadeResult {
  id: string
  kind: GenerateKind
  prompt: string
  model?: string
}

export interface StudioEnv {
  /** Makes the media with the model the user's group chose. Returns what it made and what it cost. */
  generate: (kind: GenerateKind, args: GenerateArgs) => Promise<{ assetIds: string[]; costUsd: number; assets?: Array<{ id: string; url: string; title: string; type: GenerateKind }> }>
  /** Estimated cost of a generation, or null when the price is unknown */
  estimate: (kind: GenerateKind, args: GenerateArgs) => number | null
  skills: Array<{ id: string; name: string; description: string; method: string }>
  /** What has been made in this conversation */
  made: () => MadeResult[]
  ledger: Ledger
  limits: SpendLimits
  /** Ask the person to approve the plan before anything is made */
  requirePlanApproval: boolean
  /** "About you" from Settings */
  about?: string
  /** Memory is on (default): the agent may save facts and sees what is saved */
  memory?: boolean
  /** Looks at a finished picture (or a video's frame) against what was asked for, with a model that can see */
  check?: (resultId: string, brief: string) => Promise<{ checked: boolean; matches?: boolean; issues?: string; note?: string }>
  /** Looks into a question with its own reading and searching and returns a short answer, so long pages stay out of the plan's context */
  research?: (question: string) => Promise<string>
  /** Present when the person started from Apps: the same agent then also builds the app (see lib/apps/app-tools.ts) */
  apps?: AppEnv
  /** Present when the app can run the AI tools (remove background, upscale ...) on results and Library files */
  aiTools?: AgentToolEnv
}
