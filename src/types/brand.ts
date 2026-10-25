export interface BrandLogoItem {
  id: string
  name: string
  url: string
  type: "primary" | "dark" | "light" | "mark" | "monogram"
  /** A short label the user gave it, shown when the logo is hovered */
  tag?: string
}

export interface BrandColorItem {
  id: string
  name: string
  hex: string
  role: "primary" | "secondary" | "accent" | "background" | "surface"
}

export interface BrandTypographyItem {
  id: string
  role: "heading" | "body" | "accent" | "mono"
  fontFamily: string
  sampleText?: string
}

export interface BrandProductItem {
  id: string
  name: string
  category: string
  description?: string
  images: string[] // multiple images grouped by product
}

export interface BrandVisualGroupItem {
  id: string
  groupTitle: string // e.g. "Key Art Moodboard", "Wardrobe Reference", "Lighting Continuity"
  images: string[]   // multiple images grouped
}

export interface BrandSocialItem {
  id: string
  platform: string
  url: string
}

/** A reusable starting prompt for this brand, for example a social post or a poster */
export interface BrandTemplate {
  id: string
  name: string
  ratio: string
  /** The prompt. {brand} and {tagline} are replaced with the kit's own words. */
  prompt: string
}

export interface BrandKit {
  id: string
  name: string
  domain?: string
  tagline?: string
  about: string
  logos: BrandLogoItem[]
  colors: BrandColorItem[]
  typography: BrandTypographyItem[]
  instructions: string[]
  products: BrandProductItem[]
  visualGroups: BrandVisualGroupItem[]
  social?: BrandSocialItem[]
  templates?: BrandTemplate[]
  /** The logo shown when no logo image has been added: a key of STORY_ICONS */
  icon?: string
  createdAt?: number
  updatedAt: string
  isActive?: boolean
}
