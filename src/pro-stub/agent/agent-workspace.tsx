import { UpgradeCard } from "@/components/license/upgrade-card"
import type { AgentWorkspaceProps } from "@/components/agent/props"

/** Stands in for the Agent screen in the community build. */
export function AgentWorkspace(_props: AgentWorkspaceProps) {
  return <UpgradeCard feature="The Agent" communityBuild />
}
