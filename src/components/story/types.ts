import type { EditProject } from "./edit-model"

/** The shapes a story is made of: a story holds scenes, a scene holds shots. */

export interface ContextItem {
  id: string
  type: "character" | "location" | "prop" | "ref"
  name: string
  thumbnailUrl?: string
}

export interface ShotItem {
  id: string
  shotNumber: number
  mode: "video" | "image"
  prompt: string
  generatedSlots: Array<{
    id: string
    url?: string
    status: "empty" | "generating" | "completed"
  }>
  contextItems: ContextItem[]
  cameraPreset: string
  cameraThumbnailUrl?: string
  lightingPreset: string
  lightingThumbnailUrl?: string
  model: string
  aspectRatio: string
  resolution: string
  duration: string
  multiShot: boolean
}

export interface SceneItem {
  id: string
  sceneNumber: number
  title: string
  /** Semantic accent color hex */
  color: string
  intro: string
  environment: string
  lightingKey: string
  characters: string[]
  shots: ShotItem[]
}

/** One scene of the plain-words notes */
export interface DraftScene {
  id: string
  title: string
  text: string
}

/** A character, location, prop or product in the story */
export interface CastItem {
  id: string
  /** The kind it is listed under: Character, Location, Props, Product, or a name the user gave */
  group: string
  name: string
  color: string
  role: string
  describe: string
  /** Pictures: uploaded, or made in a beat */
  images: string[]
  /** Tagged on the Cast page to show in the story's overview */
  final?: boolean
}

export interface StoryItem {
  id: string
  title: string
  /** The story's logo: a key of STORY_ICONS */
  icon: string
  /** A picture used as the cover of the overview. Missing means the first picture made. */
  cover?: string
  genre: string
  logline: string
  screenplay: string
  /** The Normal tab: the story in plain words, a card for each scene */
  draft?: DraftScene[]
  /** The brand kit this story is made for: the agents read it when they write or edit */
  brandId?: string
  /** The video the user chose as the final one, on the overview */
  finalVideo?: string
  /** The Cast page: characters, locations, props and products */
  cast?: CastItem[]
  /** The kinds shown as tabs on the Cast page: the usual three, and any the user added */
  castGroups?: string[]
  scenes: SceneItem[]
  /** The cut: clips from the shots, captions and audio */
  edit?: EditProject
  createdAt: number
  updatedAt: number
}
