import type { Ledger, SpendLimits } from "@/lib/agent/policy"
import type { MatchContext } from "./match"
import type { ToolMedia } from "./run"
import type { ModelRecord } from "@/lib/registry/types"
import type { MediaAsset } from "@/types"
import type { Surface } from "./types"

/**
 * Every model tool in the catalog, offered to an agent as two tools: list_tools (what can run now, with prices) and run_tool (run one).
 * A new catalog entry is usable by agents with no further code. The page supplies the environment, so the same code serves the edit
 * agent, the Create agent and Apps.
 */

export interface AgentToolEnv {
  surface: Surface
  /** What the app knows right now (keys, switched-on models) */
  context: () => MatchContext
  /** The media an id names: a result made earlier, a Library file, or the selected clip. Throws a clear error when there is none. */
  media: (id: string) => ToolMedia
  /** Runs the tool; the page decides where the result goes. Returns the new media and what it cost. */
  run: (toolId: string, endpoint: string, media: ToolMedia, input: { prompt?: string; options?: Record<string, string | number | boolean> }) => Promise<{ assets: MediaAsset[]; costUsd: number }>
  /** Which of the models that can do a tool to use (the level's pick). Without it the first, best-ranked one runs. */
  choose?: (toolId: string, candidates: ModelRecord[]) => ModelRecord | undefined
  /** What a run would cost, or null when the price is unknown (used for the approval rule) */
  estimate: (toolId: string, mediaId: string, options?: Record<string, string | number | boolean>) => number | null
}

/** Where the money is counted: the same ledger and limits the generate tools use */
export interface Spend {
  ledger: Ledger
  limits: SpendLimits
}

export interface RunHooks {
  /** Before the run: return a reason to stop (the person declined, the budget is spent) or null to go on */
  before?: (estimateUsd: number | null) => Promise<string | null>
  /** After the run: put the result where it belongs (the cut, the Library) */
  after?: (assets: MediaAsset[], media: ToolMedia, toolId: string) => Promise<string | void>
}
