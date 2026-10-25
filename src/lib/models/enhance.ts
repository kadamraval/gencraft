/**
 * Quiet prompt improvement, with no model call and so no tokens and no cost.
 *
 * A short prompt leaves most of the picture to chance: the light, the camera, the style, the motion. Platforms fill that in
 * for the person. This does the same with fixed phrases, and only for what is missing. The person's own words are never
 * changed: the additions go after them, as a separate sentence. Nothing is sent anywhere, and nothing is read but the prompt.
 *
 * It does nothing when the prompt is already detailed, when it is a list of shots, when files are attached (that is usually an
 * edit or a composition, where extra words can change the meaning), for a task such as edit or extend, or when the model has
 * its own enhancer switched on.
 */

export type Aspect = "light" | "camera" | "style" | "motion"

/** How long a prompt can be before it counts as already detailed. */
export const DETAILED_WORDS = 25

const WORDS: Record<Aspect, RegExp> = {
  light: /\b(light|lighting|lit|sunlight|sunlit|sunset|sunrise|golden hour|blue hour|dusk|dawn|twilight|neon|backlit|backlight|rim light|spotlight|candlelight|moonlight|shadow|shadows|glow|glowing|overcast|studio|daylight|night|midday|silhouette|hdr|volumetric)\b/i,
  camera: /\b(shot|close-?up|wide|angle|camera|pan|tilt|zoom|dolly|tracking|aerial|drone|lens|pov|macro|bokeh|depth of field|overhead|top-?down|low angle|high angle|eye level|handheld|steadicam|push-?in|pull-?out|orbit|fisheye|telephoto|portrait|landscape|panorama|\d+\s?mm)\b/i,
  style: /\b(cinematic|photoreal\w*|realistic|anime|manga|cartoon|illustration|illustrated|3d|render|rendered|film|filmic|painting|painted|watercolou?r|oil|sketch|drawing|pixel|vector|cgi|animation|animated|documentary|vintage|retro|noir|minimal\w*|surreal|fantasy|sci-?fi|cyberpunk|35mm|16mm|kodak|fuji|photograph\w*|style|aesthetic|poster|logo|icon|diagram)\b/i,
  motion: /\b(walk\w*|run\w*|jump\w*|turn\w*|mov\w+|flow\w*|fly\w*|flies|fall\w*|rise|rises|rising|spin\w*|danc\w*|ride\w*|rid(e|ing)|swim\w*|drift\w*|float\w*|wave\w*|wav(e|ing)|shak\w+|open\w*|clos\w+|smil\w+|laugh\w*|talk\w*|speak\w*|look\w*|reach\w*|pull\w*|push\w*|throw\w*|catch\w*|crash\w*|explod\w*|burn\w*|pour\w*|splash\w*|blow\w*|sway\w*|glid\w*|race\w*|chas\w+|fight\w*|climb\w*|fight\w*|slow motion|time-?lapse)\b/i,
}

/** What gets added for each missing aspect, per kind of result. Plain, neutral phrases that rarely clash with a subject. */
const ADD: Record<"image" | "video", Partial<Record<Aspect, string>>> = {
  image: { light: "soft natural lighting", camera: "medium shot", style: "high detail, sharp focus" },
  video: { light: "soft natural lighting", camera: "medium shot, slow camera push-in", style: "cinematic", motion: "smooth natural motion" },
}

export interface EnhanceContext {
  modality: string
  /** A start or end frame, a reference picture, a video or a sound is attached */
  hasFiles?: boolean
  /** The run is an edit, an extend, a lip-sync or another task on an existing file */
  hasTask?: boolean
  /** The model's own enhancer is on, so a second one would over-rewrite */
  nativeOn?: boolean
  /** The person turned automatic improvement off */
  off?: boolean
}

export interface Enhanced {
  prompt: string
  /** What was added, by aspect. Empty when nothing was */
  added: Aspect[]
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

/** Every word the person wrote is still there, in order, untouched. The additions only ever go after them. */
export function keepsOriginal(original: string, improved: string): boolean {
  return improved.startsWith(original.trimEnd()) || improved.startsWith(original.trim().replace(/[.\s]+$/, ""))
}

/** Which of the aspects the prompt does not already say anything about. */
export function missingAspects(prompt: string, modality: "image" | "video"): Aspect[] {
  const wanted = Object.keys(ADD[modality]) as Aspect[]
  return wanted.filter((a) => !WORDS[a].test(prompt))
}

export function enhancePrompt(prompt: string, ctx: EnhanceContext): Enhanced {
  const none: Enhanced = { prompt, added: [] }
  const modality = ctx.modality
  if (ctx.off || ctx.hasFiles || ctx.hasTask || ctx.nativeOn) return none
  if (modality !== "image" && modality !== "video") return none
  const text = prompt.trim()
  if (!text || wordCount(text) >= DETAILED_WORDS) return none
  // A list of shots, timed lines, a script line or a tagged reference is the person's own structure: leave it
  if (/\n/.test(text) || /^\s*\d+(\.\d+)?\s*s\b/i.test(text) || /@\w/.test(text) || /<ref_image_\d+>|\bimage\s?\d+\b/i.test(text)) return none
  // Words that must appear in the result, or speech, are the person's exactly: do not pad around them
  if (/["“”'‘’][^"“”'‘’]{2,}["“”'‘’]/.test(text) && /\b(says?|said|text|reads?|written|caption|title|sign|saying|word|words|quote|quoted|dialogue)\b/i.test(text)) return none
  const missing = missingAspects(text, modality)
  if (missing.length === 0) return none
  const phrases = missing.map((a) => ADD[modality][a]!).filter(Boolean)
  const improved = `${text.replace(/[.\s]+$/, "")}. ${phrases.join(", ")}.`
  // The safeguard: if the person's words were somehow not kept as they were, send the original
  return keepsOriginal(text, improved) ? { prompt: improved, added: missing } : none
}
