/**
 * The name people see for a picture, video or sound model: its family and version, nothing else ("Kling 3.0", "FLUX 3", "Topaz"). What it
 * is for (video, image, edit, upscale ...) is already said by its category and its job, so those words are left out; what tells two
 * models of one version apart (Pro, Lite, Klein, Turbo) is shown beside the name as a small badge (`variant`). Chat model names are the
 * makers' own and stay as they are.
 */

/** Words that say what a model is for, never which model it is */
const JOB = new Set([
  "video", "videos", "image", "images", "edit", "editing", "editor", "upscale", "upscaler", "upscaling", "extension", "extend", "removal",
  "remove", "background", "erase", "keypoints", "restyle", "relight", "interpolate", "interpolation", "deblur", "restore", "restoration",
  "colorization", "colorize", "motion", "control", "animate", "replace", "s2v", "i2v", "t2v", "r2v", "isolation", "changer", "dubbing",
  "lipsync", "quality", "precise", "generation", "generator",
])
/** Plain words that name no model on their own */
const PLAIN = new Set(["audio", "voice", "object", "frame", "face", "stable", "reframe", "sound", "speech", "style", "transfer", "enhance", "cloning", "realistic"])
/** "Video To Music", "Text To Speech": the job, written out */
const JOB_PHRASE = /\b(text|image|video|audio|speech)\s+to\s+(text|image|video|audio|speech|music)\b/gi
/** A version as makers write it: 3.0, 2.5, V3, Q4, H3, O3 */
const VERSION = /^([vV]?\d+(\.\d+)*|[A-Za-z]\d+(\.\d+)?)$/

const titled = (w: string) => (/^[a-z]+$/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w)

function words(text: string): string[] {
  return text
    .replace(/\[[^\]]*\]/g, " ")
    .replace(JOB_PHRASE, " ")
    .split(/\s+/)
    .filter(Boolean)
}

const baseOf = (family: string) => words(family).filter((w) => !JOB.has(w.toLowerCase())).join(" ")

/** A family of the same maker, with what it makes */
export interface SiblingFamily {
  family: string
  category: string
}

/**
 * The family without its job word, when the maker has the same family making pictures and clips ("FLUX Video" beside the picture model
 * "FLUX", "Grok Imagine Image" beside "Grok Imagine Video"). A family whose own name holds the word and has no such sibling keeps it
 * ("GPT Image", whose maker's "GPT" makes no pictures or clips).
 */
export function cleanFamily(family: string, category: string, siblings: SiblingFamily[] = []): string {
  const base = baseOf(family)
  if (!base || base === family) return family
  const media = (c: string) => c === "image" || c === "video"
  return siblings.some((f) => f.family !== family && media(f.category) && f.category !== category && baseOf(f.family) === base) ? base : family
}

/**
 * The simple name and the badge for a model: `name` is its family and version, `variant` what tells it apart within that version.
 * `fallback` (its maker) is used when only plain words are left (a model named by its job: "Dubbing", "Voice Changer").
 */
export function simpleName(name: string, family: string | undefined, category: string, siblings: SiblingFamily[], fallback: string): { name: string; variant?: string } {
  if (family && name.toLowerCase().startsWith(family.toLowerCase())) {
    const base = cleanFamily(family, category, siblings)
    const rest = words(name.slice(family.length))
    const version = rest.length > 0 && VERSION.test(rest[0]!) ? rest.shift()!.replace(/^v(?=\d)/, "") : undefined
    const variant = rest.filter((w) => !JOB.has(w.toLowerCase())).map(titled).join(" ")
    return { name: [base, version].filter(Boolean).join(" "), ...(variant ? { variant } : {}) }
  }
  // No family known (a model for one job): its name without the job words, "v3" read as 3 and "V1 1" as 1.1. When only plain words
  // are left ("Voice Changer" leaves "Voice"), it is named by its maker.
  const left = words(name).filter((w) => !JOB.has(w.toLowerCase()))
  if (left.length === 0 || left.every((w) => PLAIN.has(w.toLowerCase()))) return { name: fallback }
  const kept = left
    .map((w) => w.replace(/^[vV](?=\d)/, ""))
    .join(" ")
    .replace(/\b(\d+) (\d+)\b/g, "$1.$2")
    .trim()
  // Spelled the way its maker spells the family ("Ltx 2.3" is "LTX 2.3")
  const fam = siblings.find((f) => kept.toLowerCase() === f.family.toLowerCase() || kept.toLowerCase().startsWith(`${f.family.toLowerCase()} `))
  return { name: fam ? fam.family + kept.slice(fam.family.length) : kept }
}
