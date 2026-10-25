import type { BrandKit } from "@/types/brand"

/** Brand kits are kept on this device so they are still there after the app restarts. */
const KEY = "gencraft_brands_v1"

export function loadBrands(): BrandKit[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as BrandKit[]) : []
  } catch {
    return []
  }
}

/** Returns false when the browser refused to keep it (usually because the images are too many). */
export function saveBrands(kits: BrandKit[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(kits))
    return true
  } catch {
    return false
  }
}

export function blankKit(input: { name: string; icon: string; domain?: string; tagline?: string; logo?: string; about?: string; social?: Array<{ platform: string; url: string }> }): BrandKit {
  const now = Date.now()
  return {
    id: `brand-${now}`,
    name: input.name,
    icon: input.icon,
    domain: input.domain || undefined,
    tagline: input.tagline || undefined,
    about: input.about ?? "",
    social: (input.social ?? []).map((x, i) => ({ id: `soc-${now}-${i}`, ...x })),
    templates: [],
    logos: input.logo ? [{ id: `logo-${now}`, name: "Logo", url: input.logo, type: "primary", tag: "primary" }] : [],
    colors: [],
    typography: [],
    instructions: [],
    products: [],
    visualGroups: [],
    createdAt: now,
    updatedAt: new Date(now).toISOString(),
  }
}
