import * as React from "react"

/**
 * What the person has done in the tutorials, kept on this device: which videos they finished, and the comments
 * they wrote under each video. Sharing comments with other people needs the API and comes later.
 */
const DONE = "gencraft_lessons_done_v1"
const NOTES = "gencraft_lesson_comments_v1"

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable: nothing is kept
  }
}

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
function useStore<T>(key: string, fallback: T): T {
  const [value, setValue] = React.useState<T>(() => read(key, fallback))
  React.useEffect(() => {
    const on = () => setValue(read(key, fallback))
    listeners.add(on)
    return () => {
      listeners.delete(on)
    }
    // fallback is a constant for each caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return value
}

const NONE: string[] = []
export const useDone = () => useStore<string[]>(DONE, NONE)
export function setDone(id: string, done: boolean) {
  const now = read<string[]>(DONE, [])
  write(DONE, done ? [...new Set([...now, id])] : now.filter((x) => x !== id))
  emit()
}

export interface Comment {
  id: string
  text: string
  at: number
}
const NO_NOTES: Record<string, Comment[]> = {}
export const useComments = (videoId: string): Comment[] => useStore<Record<string, Comment[]>>(NOTES, NO_NOTES)[videoId] ?? []
export function addComment(videoId: string, text: string) {
  const all = read<Record<string, Comment[]>>(NOTES, {})
  all[videoId] = [{ id: `c-${Date.now()}`, text: text.trim(), at: Date.now() }, ...(all[videoId] ?? [])]
  write(NOTES, all)
  emit()
}
export function removeComment(videoId: string, id: string) {
  const all = read<Record<string, Comment[]>>(NOTES, {})
  all[videoId] = (all[videoId] ?? []).filter((c) => c.id !== id)
  write(NOTES, all)
  emit()
}
