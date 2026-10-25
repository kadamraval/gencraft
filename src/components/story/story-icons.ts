import { Clapperboard, Compass, Crown, Film, Flame, Ghost, Heart, Mountain, Rocket, Skull, Sparkles, Swords, type LucideIcon } from "lucide-react"

/** The logos a story can have. The key is what is saved with the story. */
export const STORY_ICONS: Record<string, LucideIcon> = {
  film: Film,
  clapperboard: Clapperboard,
  rocket: Rocket,
  ghost: Ghost,
  heart: Heart,
  swords: Swords,
  sparkles: Sparkles,
  mountain: Mountain,
  skull: Skull,
  crown: Crown,
  compass: Compass,
  flame: Flame,
}

export const DEFAULT_STORY_ICON = "film"

export const storyIcon = (key: string | undefined): LucideIcon => STORY_ICONS[key ?? ""] ?? STORY_ICONS[DEFAULT_STORY_ICON]!
