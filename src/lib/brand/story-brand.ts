import { describeKit } from "./brand-ops"
import { loadBrands } from "./brand-storage"

/** The brand kit a story was given, in words for the script and edit agents. Empty when the story has none. */
export function storyBrandContext(brandId: string | undefined): string {
  const kit = brandId ? loadBrands().find((k) => k.id === brandId) : undefined
  return kit ? `This story is for a brand. Keep its tone, colors, fonts and rules in everything you write or change.\n${describeKit(kit)}` : ""
}
