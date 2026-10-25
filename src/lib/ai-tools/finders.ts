/**
 * How to recognise a tool's models among ANY provider's models, by what the model does: its id, name and its own description.
 * The endpoint lists in endpoints.ts are only the models checked by hand and put first; these words find the rest, so a model added from
 * Replicate, fal or anywhere else works as soon as it is in the registry and its provider has a key.
 *
 * `words` must match the model's text; `not` must not (generators of the same thing from text, for example).
 */
export interface Finder {
  words: string
  not?: string
}

const bg = "background[-_ ]?(remov|matt|eras)|remove[-_ ]?bg|rembg|bg[-_ ]?remov|matting|green[-_ ]?screen|salient|birefnet|(^|[/-])(bria|bg)[-_]?remove"
const upscale = "upscal|super[-_ ]?resolution|esrgan|clarity|supir|seedvr|topaz|enhance[-_ ]?(video|image)|magnific|crisp"

export const FINDERS: Record<string, Finder> = {
  "audio-voice-isolation": { words: "isolat|demucs|vocal[-_ ]?remov|vocal[-_ ]?extract|separat|spleeter|uvr|speech[-_ ]?enhanc" },
  "audio-noise-reduction": { words: "denois|noise|deepfilter|clean[-_ ]?audio|speech[-_ ]?enhanc|resemble[-_ ]?enhanc|studio[-_ ]?sound|demucs", not: "image|video" },
  "audio-stems": { words: "demucs|stem|spleeter|separat|htdemucs" },
  "audio-voice-changer": { words: "voice[-_ ]?(chang|convert|clon)|rvc|speech[-_ ]?to[-_ ]?speech|sts" },
  "video-remove-background": { words: bg, not: "image-only|text-to" },
  "video-remove-object": { words: "(remov|eras|inpaint)\\w*.*(object|video)|video[-_ ]?inpaint|propainter|object[-_ ]?remov|erase" },
  "video-upscale": { words: upscale },
  "video-slow-motion": { words: "interpolat|rife|slow[-_ ]?mo|frame[-_ ]?(interp|rate)|film[-_ ]?interp|fps|amt" },
  "video-denoise": { words: "denois|deblur|restor|clean|remaster|artifact" },
  "video-colorize": { words: "coloriz|colourize|deoldify|ddcolor" },
  "video-relight": { words: "relight|light[-_ ]?(transfer|edit)|ic[-_ ]?light" },
  "video-restyle": { words: "restyl|video[-_ ]?to[-_ ]?video|v2v|style[-_ ]?transfer|stylize|video[-_ ]?edit|modify|lucy|aleph" },
  "video-reframe": { words: "reframe|outpaint|aspect[-_ ]?(ratio)?[-_ ]?chang|recompos|extend[-_ ]?canvas" },
  "video-dub": { words: "dub|translate|lip[-_ ]?sync[-_ ]?translat|localiz" },
  "video-remove-fillers": { words: "filler|disfluen|um[-_ ]?remov" },
  "video-sound-effects": { words: "video[-_ ]?to[-_ ]?(audio|sound|foley)|foley|mmaudio|sound[-_ ]?effect|thinksound|hunyuan[-_ ]?foley" },
  "video-music": { words: "video[-_ ]?to[-_ ]?music|score|soundtrack|video[-_ ]?to[-_ ]?audio|mmaudio" },
  "image-remove-background": { words: bg },
  "image-upscale": { words: upscale },
  "image-restore": { words: "restor|codeformer|gfpgan|face[-_ ]?(restor|enhanc)|denois|deblur|old[-_ ]?photo|scratch|supir" },
  "image-remove-object": { words: "(remov|eras|inpaint)|lama|object[-_ ]?remov|cleanup|clean[-_ ]?up" },
  "image-relight": { words: "relight|ic[-_ ]?light|light[-_ ]?(transfer|edit)" },
  "image-restyle": { words: "restyl|style[-_ ]?transfer|stylize|img2img|image[-_ ]?to[-_ ]?image|redux|kontext|instruct" },
  "image-outpaint": { words: "outpaint|expand|extend|uncrop|fill|canvas" },
}
