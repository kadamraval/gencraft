/**
 * Elements are the user's reusable building blocks for a prompt.
 *
 *  - Reference elements (character, location, product, prop) are images. The image is the reference, so it is
 *    sent as a reference image when the model can take one. Their optional words stand in for the pictures when the
 *    model cannot take them (or has no room left).
 *  - Style elements (camera, light, style, effects) are prompt text. The text comes from a ready-made preset,
 *    from the user, or from a vision model that described an example image or clip.
 */

export const REFERENCE_CATEGORIES = ["character", "location", "product", "prop"] as const
export const STYLE_CATEGORIES = ["camera", "light", "style", "effects"] as const

export type ReferenceCategory = (typeof REFERENCE_CATEGORIES)[number]
export type StyleCategory = (typeof STYLE_CATEGORIES)[number]
export type ElementCategory = ReferenceCategory | StyleCategory

export const CATEGORY_LABEL: Record<ElementCategory, string> = {
  character: "Character",
  location: "Location",
  product: "Product",
  prop: "Prop",
  camera: "Camera",
  light: "Light",
  style: "Style",
  effects: "Effects",
}

export const isReferenceCategory = (c: ElementCategory): c is ReferenceCategory => (REFERENCE_CATEGORIES as readonly string[]).includes(c)

/** When a model takes fewer reference images than the user attached, earlier categories keep their slot first. */
export const REFERENCE_PRIORITY: ReferenceCategory[] = ["character", "product", "prop", "location"]

export interface ElementRecord {
  id: string
  category: ElementCategory
  name: string
  /** Reference elements: one or more images. Empty for style elements. */
  images: Blob[]
  /** Style elements: the words that are added to the prompt. Reference elements: optional words that stand in for the pictures. */
  text: string
  /** Where the text came from, so the user can tell a preset from their own and from a described example */
  origin: "preset" | "written" | "described"
  /** The model that described the example, when origin is "described" */
  describedBy?: string
  createdAt: number
}

/** An element ready to use: image blobs turned into addresses the page can show and send. */
export interface ElementItem {
  id: string
  category: ElementCategory
  name: string
  imageUrls: string[]
  text: string
  origin: ElementRecord["origin"]
  describedBy?: string
  createdAt: number
}
