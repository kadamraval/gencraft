/**
 * When the agent may spend without asking. One pure function, so the rule is the same in the app and in the tests.
 *
 * A result that costs no more than the auto-approve limit just runs. A dearer one waits for the person. One that would take
 * the total past the budget is refused, and the agent is told why so it can choose something cheaper or finish.
 */

export interface Ledger {
  spentUsd: number
  generations: number
}

export interface SpendLimits {
  budgetUsd: number
  /** A result up to this price runs without asking */
  autoApproveUsd: number
  /** The most results one conversation may make */
  maxGenerations: number
}

export type Approval = undefined | "user-approval" | { type: "denied"; reason: string }

const money = (n: number) => `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`

export function approvalFor(costUsd: number | null, ledger: Ledger, limits: SpendLimits): Approval {
  if (ledger.generations >= limits.maxGenerations) {
    return { type: "denied", reason: `${limits.maxGenerations} results have been made. Finish with what exists.` }
  }
  // An unknown price cannot be promised, so the person decides
  if (costUsd === null) return "user-approval"
  if (ledger.spentUsd + costUsd > limits.budgetUsd) {
    const left = Math.max(0, limits.budgetUsd - ledger.spentUsd)
    return { type: "denied", reason: `This would cost about ${money(costUsd)} and only ${money(left)} is left. Make something cheaper or finish.` }
  }
  return costUsd <= limits.autoApproveUsd ? undefined : "user-approval"
}

export const remainingUsd = (ledger: Ledger, limits: SpendLimits): number => Math.max(0, limits.budgetUsd - ledger.spentUsd)

/**
 * What the conversation has spent so far: every result it made (each generation records its cost in its saved tool result), and the
 * text the agent itself used (each reply carries what its turn's text calls cost).
 */
export function ledgerFromMessages(messages: Array<{ metadata?: unknown; parts?: Array<{ type: string; state?: string; output?: unknown }> }>): Ledger {
  const ledger: Ledger = { spentUsd: 0, generations: 0 }
  for (const m of messages) {
    const textUsd = (m.metadata as { costUsd?: unknown } | undefined)?.costUsd
    if (typeof textUsd === "number") ledger.spentUsd += textUsd
    for (const p of m.parts ?? []) {
      if (!p.type.startsWith("tool-generate_") || p.state !== "output-available") continue
      const out = p.output as { costUsd?: unknown } | undefined
      ledger.generations++
      if (typeof out?.costUsd === "number") ledger.spentUsd += out.costUsd
    }
  }
  return ledger
}
