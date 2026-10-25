import type { AgentRuntime, StudioUIMessage } from "@/lib/agent/chat"
import type { GenerateArgs, GenerateKind } from "@/lib/agent/types"
import type { AppMeta } from "@/lib/apps/app-types"
import type { AppSpec } from "@/lib/apps/types"
import type { MediaAsset } from "@/types"

/** What the Agent screen is given. The screen itself is in src/pro/ (the official app); the community build has a stand-in that takes the same props. */
export interface AgentWorkspaceProps {
  conversationId: string
  initialMessages: StudioUIMessage[]
  /** Called each time the agent is asked to continue. Throws a message the person can read when nothing can run. */
  runtime: () => AgentRuntime
  budgetUsd: number
  assets: MediaAsset[]
  estimate: (kind: GenerateKind, args: GenerateArgs) => number | null
  onOpenAsset?: (asset: MediaAsset) => void
  onMessages: (messages: StudioUIMessage[]) => void
  onBusy: (busy: boolean) => void
  /** Who the agent is, for the card on the blank screen, and how big the model's window is */
  /** The app being built, when the person started from Apps, Create new */
  app?: AppMeta
  /** Opens an app the agent built */
  onOpenApp?: (spec: AppSpec) => void
  info?: { model: string; modelId?: string; contextTokens?: number; autoApproveUsd: number; planApproval: boolean }
}
