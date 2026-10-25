/**
 * The slides at the top of Home. They are written here for now; later they come from the API (see fetchBanners),
 * so a slide is just data: a title, a line, a picture from public/home and where its button goes.
 */
import type { MainNavTab } from "@/types"

export interface Banner {
  id: string
  title: string
  text: string
  image: string
  action: string
  go: { tab: MainNavTab; brandTab?: "brand" | "elements" }
}

const BANNERS: Banner[] = [
  { id: "welcome", title: "Welcome to Gencraft", text: "Turn an idea into images, video, voice and finished stories. Your keys, your files, on your device.", image: "02_video.png", action: "Start creating", go: { tab: "chat" } },
  { id: "story", title: "Write it. Shoot it. Cut it.", text: "Story takes a script to scenes and shots, then to a finished cut you can export.", image: "08_story.png", action: "Open Story", go: { tab: "story" } },
  { id: "brand", title: "Keep every brand on brand", text: "Read a logo and name from a website, then set colors, fonts, products and rules once.", image: "06_brand.png", action: "Make a brand kit", go: { tab: "brand", brandTab: "brand" } },
  { id: "learn", title: "Learn at your own pace", text: "Courses from basic to advanced, with videos you can follow along.", image: "07_skills.png", action: "Start a course", go: { tab: "tutorials" } },
]

/** Later: fetch these from the API. For now it answers with the list above. */
export async function fetchBanners(): Promise<Banner[]> {
  return BANNERS
}
