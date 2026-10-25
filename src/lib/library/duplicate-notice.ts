import { raiseChip } from "@/lib/ui/chips"
import type { UploadResult } from "./library-store"

/** Says so when an upload is one you already have: the same file (not saved again), the same name and size, or a picture that looks like one */
export function noteDuplicate(saved: UploadResult): void {
  if (!saved.duplicate) return
  const { kind, of } = saved.duplicate
  raiseChip({
    key: `duplicate:${saved.id}:${of.id}`,
    level: "info",
    kind: "note",
    title: kind === "same" ? "Already in your library" : kind === "named" ? "Same name as a file you have" : "Looks like a picture you have",
    message:
      kind === "same"
        ? `"${of.title}" is already uploaded, so it was not saved again. That one is used.`
        : kind === "named"
          ? `"${of.title}" has the same name and size. Both are kept.`
          : `It looks like "${of.title}". Both are kept.`,
    ttl: 9000,
  })
}
