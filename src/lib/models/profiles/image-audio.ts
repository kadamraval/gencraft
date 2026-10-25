import type { Profile, Source } from "../types"

/**
 * Image and speech makers: how to ask each one for a good result, written from the makers' own pages (read
 * 2026-10-13). Settings come from the host's own list; a profile here adds what a host cannot say.
 */

const source = (url: string, note: string): Source => ({ url, read: "2026-10-13", tier: "official", note })

const text = (v: unknown) => String(v ?? "").toLowerCase()

export const IMAGE_AUDIO_PROFILES: Profile[] = [
  {
    id: "nano-banana-2.1",
    names: ["Nano Banana 2.1"],
    maker: "Google",
    kind: "image",
    rules: [],
    recipe: {
      tips: [
        "Describe the scene in full sentences rather than a list of keywords.",
        "When you edit, say what should change and what should stay the same.",
        "Name each picture you attach (the first, the second) and what to take from it.",
      ],
    },
    sources: [source("https://ai.google.dev/gemini-api/docs/image-generation", "prompting guidance, image sizes, thinking, references")],
  },
  {
    id: "gpt-image-2.5",
    names: ["GPT Image 2.5"],
    maker: "OpenAI",
    kind: "image",
    rules: [],
    recipe: {
      tips: [
        "Say what the picture is for and where any text goes, with the words in quotes.",
        "A see-through background needs PNG or WebP.",
        "Higher quality costs more tokens; start low and raise it once the picture is right.",
      ],
      lint: ({ selection }) => (text(selection.values.background) === "transparent" && text(selection.values.output_format) === "jpeg" ? ["A see-through background needs PNG or WebP, not JPEG."] : []),
    },
    sources: [source("https://platform.openai.com/docs/guides/image-generation", "quality, size, background, output format")],
  },
  {
    id: "flux-3-image",
    names: ["FLUX 3 Image"],
    maker: "Black Forest Labs",
    kind: "image",
    imageTag: (n) => `<ref_image_${n - 1}>`,
    rules: [],
    recipe: {
      tips: [
        "Refer to an attached picture as <ref_image_0>, <ref_image_1> in the order you attached them.",
        "For an exact layout, describe boxes with positions on a 0 to 1000 scale.",
      ],
    },
    sources: [source("https://docs.bfl.ml/guides/prompting_summary.md", "prompting summary"), source("https://docs.bfl.ml/api-reference/utility/generate-an-image-with-flux-3.md", "reference images, layout")],
  },
  {
    id: "gemini-tts-3.8",
    names: ["Gemini 3.8 Flash TTS", "Gemini 3.8 Flash-Lite TTS"],
    maker: "Google",
    kind: "audio",
    rules: [],
    recipe: {
      tips: [
        "The text is read word for word. Put directions such as 'whispered urgently' in the style, not in the text.",
        "Place tags like <laugh>, <sigh> or <short pause> where they should happen.",
        "Capital letters add stress (a VERY important point); ellipses and punctuation set the pace.",
        "A clip takes up to 2 speakers with the built-in voices.",
      ],
      lint: ({ prompt }) => (/\[(laugh|laughs|sigh|sighs|whisper|whispers|pause|cough|gasp)\]/i.test(prompt) ? ["This model reads <angle brackets> as tags; square brackets would be spoken."] : []),
    },
    sources: [source("https://ai.google.dev/gemini-api/docs/speech-generation", "style, inline tags, 2 speakers, voices")],
  },
  {
    id: "minimax-speech-2.8",
    names: ["Speech 2.8 HD", "Speech 2.8 Turbo"],
    maker: "MiniMax",
    kind: "audio",
    rules: [],
    recipe: {
      tips: [
        "Add a pause with <#1.5#>, a number of seconds from 0.01 to 99.99, between two pieces of text.",
        "Sounds go in round brackets: (laughs), (sighs), (breath), (clear-throat).",
        "Up to 10,000 characters in one go.",
      ],
      lint: ({ prompt, selection }) => {
        const out: string[] = []
        if (prompt.length > 10000) out.push("This model takes under 10,000 characters at a time.")
        if (String(selection.values.emotion ?? "").toLowerCase() === "whisper") out.push("Whisper is not available on Speech 2.8; use Speech 2.6 for it.")
        if (/<#\d+(\.\d+)?#>\s*<#/.test(prompt)) out.push("Two pause markers in a row are not allowed; join them into one.")
        return out
      },
    },
    sources: [source("https://platform.minimax.io/docs/api-reference/speech-t2a-http", "pause marker, interjection tags (2.8 only), emotion values, 10,000 characters")],
  },
  {
    id: "minimax-speech-2.6",
    names: ["Speech 2.6 HD", "Speech 2.6 Turbo"],
    maker: "MiniMax",
    kind: "audio",
    rules: [],
    recipe: {
      tips: ["Add a pause with <#1.5#>, a number of seconds from 0.01 to 99.99, between two pieces of text.", "Fluent and whisper feelings are available on this version."],
      lint: ({ prompt }) => (/\((laughs|chuckle|sighs|breath|gasps|coughs)\)/i.test(prompt) ? ["Sound tags such as (laughs) work on Speech 2.8, not 2.6."] : []),
    },
    sources: [source("https://platform.minimax.io/docs/api-reference/speech-t2a-http", "emotion values per version, pause marker")],
  },
  {
    id: "eleven-v4",
    names: ["Eleven v4", "ElevenLabs v4"],
    maker: "ElevenLabs",
    kind: "audio",
    rules: [],
    recipe: {
      tips: [
        "Put the feeling in square brackets before the words it changes, such as [whispering, playful]. It carries on until you give a new one.",
        "Use one tag for each clause. Round or curly brackets are read aloud.",
        "Dashes, ellipses and capitals also change pace and stress.",
        "Pick a voice whose natural range suits the line.",
      ],
      lint: ({ prompt }) => (/[({][a-z ,]{3,30}[)}]/i.test(prompt) && !/\[[^\]]+\]/.test(prompt) ? ["Feelings go in square brackets; round or curly brackets are read aloud."] : []),
    },
    sources: [source("https://elevenlabs.io/blog/elevenlabs-audio-tags-list", "audio tag syntax and placement, up to 10,000 characters per generation in the app")],
  },
  {
    id: "eleven-v3",
    names: ["Eleven v3", "ElevenLabs v3"],
    maker: "ElevenLabs",
    kind: "audio",
    rules: [],
    recipe: {
      tips: [
        "Put the feeling in square brackets, such as [whispers] or [laughs], right before the words.",
        "The voice you pick matters most; try a few before changing anything else.",
        "Very short text can sound unstable; a few full sentences work best.",
      ],
      lint: ({ prompt }) => (prompt.trim().length > 0 && prompt.trim().length < 250 ? ["Short text can sound unstable on this model; a few full sentences work best."] : []),
    },
    sources: [source("https://elevenlabs.io/docs/overview/capabilities/text-to-speech", "audio tags, stability, text length")],
  },
]
