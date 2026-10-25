/** Soft tints for the clips on the timeline, picked from the clip's id so a clip keeps its colour. Each is a wash over the picture, so the frames still show. */
const VIDEO = ["bg-rose-300/30", "bg-amber-300/30", "bg-lime-300/30", "bg-teal-300/30", "bg-sky-300/30", "bg-violet-300/30"] as const

const hash = (id: string) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

export const videoTint = (id: string): string => VIDEO[hash(id) % VIDEO.length]!
/** Music and voices read differently from pictures: green for sound that was added, blue for captions */
export const AUDIO_TINT = "bg-emerald-400/25"
export const CAPTION_TINT = "bg-sky-400/25"
/** A text layer reads differently from a caption: violet */
export const TEXT_TINT = "bg-violet-400/30"
