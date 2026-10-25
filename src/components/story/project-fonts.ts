import { ensureFont } from "@/lib/brand/fonts"
import type { EditProject } from "./edit-model"

/** The Google Fonts families (with weights) the text layers of a cut use, as "Family|weight|italic" */
export function fontsOf(p: EditProject): string[] {
  const seen = new Set<string>()
  for (const c of p.captions) if (c.rich?.family) seen.add(`${c.rich.family}|${c.rich.weight}|${c.rich.italic ? 1 : 0}`)
  return [...seen]
}

/** Waits until every font a cut's text layers use is ready, so the first frame is drawn with the right letters. Never throws. */
export async function loadProjectFonts(p: EditProject): Promise<void> {
  await Promise.all(
    fontsOf(p).map((k) => {
      const [family, weight, italic] = k.split("|")
      return ensureFont(family!, Number(weight), italic === "1").catch(() => false)
    }),
  )
}
