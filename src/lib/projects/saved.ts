import type { Project } from "@/types"

/** The projects on this device. A new install starts with one, "My project". */
const KEY = "gencraft_projects_v1"

export const FIRST_PROJECT: Project = {
  id: "proj-first",
  title: "My project",
  description: "",
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: "Just now",
  defaultMode: "image",
  aspectRatio: "16:9",
  scenesCount: 0,
  assetsCount: 0,
}

export function loadProjects(): Project[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Project[] | null
    if (Array.isArray(raw) && raw.length > 0) return raw
  } catch {
    // unreadable: start with the first project
  }
  return [FIRST_PROJECT]
}

export function saveProjects(projects: Project[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(projects))
  } catch {
    // storage unavailable: projects last for this session
  }
}
