/**
 * The tutorial courses. For now they are written here and each one is a Dailymotion search; later this list can
 * come from the API (see fetchCourses), and a course can point at a fixed playlist instead of a search.
 */
export type Level = "basic" | "intermediate" | "advanced"

export interface Course {
  id: string
  level: Level
  title: string
  text: string
  /** A key of the icons the Tutorials page knows */
  icon: string
  /** The Dailymotion search that fills the course */
  query: string
}

export const LEVELS: Array<{ id: Level; label: string; text: string }> = [
  { id: "basic", label: "Basic", text: "Start here. Keys, first images, first videos." },
  { id: "intermediate", label: "Intermediate", text: "Better prompts, repeatable characters and looks." },
  { id: "advanced", label: "Advanced", text: "Whole films and brand work from start to finish." },
]

export const FEATURED: Course = { id: "featured", level: "basic", icon: "star", title: "Featured", text: "Picked videos on making images, video and stories with AI.", query: "ai video generation tutorial" }

const COURSES: Course[] = [
  { id: "first-images", icon: "image", level: "basic", title: "Your first AI images", text: "Write a prompt, pick a model and get a picture you like.", query: "ai image generation for beginners tutorial" },
  { id: "first-videos", icon: "video", level: "basic", title: "Your first AI videos", text: "Turn a picture or a sentence into a short clip.", query: "ai video generation for beginners" },
  { id: "prompts", icon: "wand", level: "intermediate", title: "Prompts that work", text: "Say what you want clearly: light, lens, mood, motion.", query: "ai prompt engineering image video tutorial" },
  { id: "characters", icon: "user", level: "intermediate", title: "Same character, every shot", text: "Keep a face and a look steady across many images.", query: "consistent character ai tutorial" },
  { id: "short-film", icon: "film", level: "advanced", title: "Make a short film", text: "Script, shots, generation and a final cut.", query: "ai short film workflow tutorial" },
  { id: "brand-shoots", icon: "briefcase", level: "advanced", title: "Brand and product shoots", text: "Campaigns that keep a brand's colors, fonts and rules.", query: "ai product photography brand campaign tutorial" },
]

/** Later: fetch these from the API. For now it answers with the list above. */
export async function fetchCourses(): Promise<Course[]> {
  return COURSES
}

export const courseById = (id: string): Course | undefined => (id === FEATURED.id ? FEATURED : COURSES.find((c) => c.id === id))
