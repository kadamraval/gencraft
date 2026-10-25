import type { StoryItem } from "./types"

/** Stories are kept on this device so they are still there after the app restarts. */
const KEY = "gencraft_stories_v1"

export function loadStories(): StoryItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as StoryItem[]) : []
  } catch {
    return []
  }
}

/** Returns false when the browser refused to keep it. */
export function saveStories(stories: StoryItem[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(stories))
    return true
  } catch {
    return false
  }
}
