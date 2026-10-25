import type { ModelRecord, RegistryModality } from "./types"

/**
 * What the user wants to make. The task decides which settings can exist, and which model version runs
 * (a model family can offer several tasks, for example Wan text-to-video and Wan image-to-video).
 */
export type Task =
  | "chat"
  | "text-to-image"
  | "image-edit"
  | "text-to-video"
  | "image-to-video"
  | "reference-to-video"
  | "video-edit"
  | "speech"
  | "audio-generation"
  | "audio-edit"
  | "transcription"
  | "audio-from-video"
  | "video-from-audio"

export const TASKS: Record<Task, { modality: RegistryModality; label: string }> = {
  chat: { modality: "text", label: "Chat" },
  "text-to-image": { modality: "image", label: "Text to image" },
  "image-edit": { modality: "image", label: "Edit or combine images" },
  "text-to-video": { modality: "video", label: "Text to video" },
  "image-to-video": { modality: "video", label: "Image to video" },
  "reference-to-video": { modality: "video", label: "Reference to video" },
  "video-edit": { modality: "video", label: "Video to video" },
  speech: { modality: "audio", label: "Speech" },
  "audio-generation": { modality: "audio", label: "Music and sound" },
  "audio-edit": { modality: "audio", label: "Audio to audio" },
  transcription: { modality: "audio", label: "Speech to text" },
  "audio-from-video": { modality: "audio", label: "Video to audio" },
  "video-from-audio": { modality: "video", label: "Audio to video" },
}

/**
 * The task a model record serves. It comes from the provider's own category; reference-to-video is the one
 * task providers put in the endpoint name instead. Nothing here is guessed from the model's brand.
 */
export function taskOf(record: Pick<ModelRecord, "modality" | "task" | "endpoint">): Task {
  if (record.modality === "text") return "chat"
  if (record.modality === "image") return record.task === "image-to-image" ? "image-edit" : "text-to-image"
  if (record.modality === "video") {
    if (/(^|[/-])(reference-to-video|r2v)($|[/-])/i.test(record.endpoint)) return "reference-to-video"
    if (record.task === "audio-to-video") return "video-from-audio"
    if (record.task === "video-to-video") return "video-edit"
    if (record.task === "image-to-video") return "image-to-video"
    return "text-to-video"
  }
  if (record.task === "speech-to-text" || record.task === "audio-to-text") return "transcription"
  if (record.task === "video-to-audio") return "audio-from-video"
  if (record.task === "text-to-speech") return "speech"
  if (record.task === "audio-to-audio") return "audio-edit"
  return "audio-generation"
}
