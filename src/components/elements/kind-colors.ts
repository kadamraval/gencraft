import type { ElementCategory } from "@/lib/elements/types"

/**
 * One colour per kind of thing a prompt can point at, used by the @ highlight, the @ list and the element chips,
 * so a character is the same colour wherever it appears. Full class names are written out so Tailwind keeps them.
 */
export type MentionKind = ElementCategory | "reference"

export const KIND_STYLE: Record<MentionKind, { pill: string; dot: string; ring: string }> = {
  character: { pill: "bg-violet-500/25 ring-violet-500/25", dot: "bg-violet-500", ring: "ring-violet-500/70" },
  location: { pill: "bg-emerald-500/25 ring-emerald-500/25", dot: "bg-emerald-500", ring: "ring-emerald-500/70" },
  product: { pill: "bg-amber-500/25 ring-amber-500/25", dot: "bg-amber-500", ring: "ring-amber-500/70" },
  prop: { pill: "bg-sky-500/25 ring-sky-500/25", dot: "bg-sky-500", ring: "ring-sky-500/70" },
  camera: { pill: "bg-rose-500/25 ring-rose-500/25", dot: "bg-rose-500", ring: "ring-rose-500/70" },
  light: { pill: "bg-yellow-500/25 ring-yellow-500/25", dot: "bg-yellow-500", ring: "ring-yellow-500/70" },
  style: { pill: "bg-fuchsia-500/25 ring-fuchsia-500/25", dot: "bg-fuchsia-500", ring: "ring-fuchsia-500/70" },
  effects: { pill: "bg-cyan-500/25 ring-cyan-500/25", dot: "bg-cyan-500", ring: "ring-cyan-500/70" },
  reference: { pill: "bg-muted-foreground/25 ring-muted-foreground/25", dot: "bg-muted-foreground", ring: "ring-muted-foreground/60" },
}

export const kindOf = (value: string | undefined): MentionKind => (value && value in KIND_STYLE ? (value as MentionKind) : "reference")
