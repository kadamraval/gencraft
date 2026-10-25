import * as React from "react"
import type { BrandKit, BrandLogoItem } from "@/types/brand"

/**
 * A kit can hold one logo for each job. "Light" and "Dark" mean the app's light and dark look: the logo that reads
 * well there. The mono versions are the single-color ones, used wherever the logo is small.
 */
export const LOGO_TAGS = [
  { id: "primary", label: "Logo Primary", hint: "The main logo, used when nothing fits better" },
  { id: "light", label: "Logo Light", hint: "For the light look" },
  { id: "dark", label: "Logo Dark", hint: "For the dark look" },
  { id: "light-mono", label: "Light Mono", hint: "One color, for the light look" },
  { id: "dark-mono", label: "Dark Mono", hint: "One color, for the dark look" },
] as const

export type LogoTag = (typeof LOGO_TAGS)[number]["id"]

export const logoTagLabel = (tag: string | undefined) => LOGO_TAGS.find((t) => t.id === tag)?.label ?? tag ?? ""

const isMono = (l: BrandLogoItem) => l.tag === "light-mono" || l.tag === "dark-mono"

/**
 * The logo to show right now. Full-color spots ask for the Light or Dark logo; small spots ask for the mono one
 * (`mono: true`). When the exact one is missing it falls back to Primary, then any full-color logo, then any logo.
 */
export function pickLogo(kit: BrandKit, dark: boolean, mono = false): BrandLogoItem | undefined {
  const find = (tag: string) => kit.logos.find((l) => l.tag === tag)
  const wanted = mono ? (dark ? "dark-mono" : "light-mono") : dark ? "dark" : "light"
  return find(wanted) ?? (mono ? pickLogo(kit, dark, false) : undefined) ?? find("primary") ?? kit.logos.find((l) => !isMono(l)) ?? kit.logos[0]
}

/** True while the app is in its dark look. Follows the switch in Settings. */
export function useIsDark(): boolean {
  const read = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  const [dark, setDark] = React.useState(read)
  React.useEffect(() => {
    const observer = new MutationObserver(() => setDark(read()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])
  return dark
}
