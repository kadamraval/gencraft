import type { AgentStep } from "@/lib/agent/types"
import type { MediaAsset } from "@/types"

/** Stands in for the older agent step list in the community build: there is nothing to show. */
export function AgentSteps(_props: { steps: AgentStep[]; assets?: MediaAsset[]; onOpen?: (asset: MediaAsset) => void }) {
  return null
}
