import type { SettingsState } from "@/types"

/**
 * The one "ask before anything over X" the person sets. It covers every run: chat, pictures, video, audio and the agent.
 * Settings saved before the two were merged may hold the agent's own number; it is used until the person sets the new one.
 */
export function askOverUsd(ai: SettingsState["aiEngine"]): number | undefined {
  return ai.limits?.confirmOverUsd ?? ai.agentAutoApproveUsd
}

/** What the agent may make without asking: the shared limit, or 50 cents while none is set. */
export const agentAutoApproveUsd = (ai: SettingsState["aiEngine"]): number => askOverUsd(ai) ?? 0.5
