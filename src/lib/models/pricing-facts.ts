/**
 * What a token costs in seconds, characters or images, where a maker bills in tokens.
 *
 * A provider that bills per token never says what one clip or one image weighs, so a price per million tokens cannot be
 * turned into a price for a run without a fact. Each fact names its source. A model with no fact gets no invented
 * number: the estimate stays open (see price.ts).
 */
export interface TokenFact {
  id: string
  /** Tested against the lower-case `provider/endpoint` */
  match: RegExp
  kind: "video-per-second" | "audio-per-second" | "image-by-quality" | "image-by-size"
  tokensPerSecond?: number
  /** Tokens one image takes, by quality (low, medium, high) or by size (1k, 2k, 4k), whichever the kind says */
  imageTokens?: Record<string, number>
  note: string
  source: string
}

const GEMINI_PRICING = "https://ai.google.dev/gemini-api/docs/pricing (read 2026-10-13)"

export const TOKEN_FACTS: TokenFact[] = [
  {
    id: "gemini-nano-banana-2.1",
    match: /gemini-nano-banana-2\.1/,
    kind: "image-by-size",
    imageTokens: { "1k": 1120, "2k": 1680, "4k": 3780 },
    note: "Output images are billed in tokens: 1,120 at 1K, 1,680 at 2K, 3,780 at 4K.",
    source: GEMINI_PRICING,
  },
  {
    id: "gemini-3-pro-image",
    match: /gemini-3-pro-image/,
    kind: "image-by-size",
    imageTokens: { "1k": 1120, "2k": 1120, "4k": 2000 },
    note: "Output images are billed in tokens: 1,120 at 1K and 2K, 2,000 at 4K.",
    source: GEMINI_PRICING,
  },
  {
    id: "gemini-3.1-flash-image",
    match: /gemini-3\.1-flash-image/,
    kind: "image-by-size",
    imageTokens: { "512px": 747, "1k": 1120, "2k": 1680, "4k": 2520 },
    note: "Output images are billed in tokens: 747 at 512px, 1,120 at 1K, 1,680 at 2K, 2,520 at 4K.",
    source: GEMINI_PRICING,
  },
  {
    id: "gemini-3.1-flash-lite-image",
    match: /gemini-3\.1-flash-lite-image/,
    kind: "image-by-size",
    imageTokens: { "1k": 1120 },
    note: "Output images are billed in tokens: 1,120 at 1K (the only size).",
    source: GEMINI_PRICING,
  },
  {
    id: "gemini-omni-video",
    match: /gemini-omni/,
    kind: "video-per-second",
    tokensPerSecond: 5792,
    note: "Video is billed on output tokens: 5,792 per second of 720p video.",
    source: "https://ai.google.dev/gemini-api/docs/pricing (read 2026-10-13)",
  },
  {
    id: "gemini-tts",
    match: /gemini-[\w.-]*tts/,
    kind: "audio-per-second",
    tokensPerSecond: 25,
    note: "Audio is 25 tokens per second.",
    source: "https://ai.google.dev/gemini-api/docs/pricing (read 2026-10-13)",
  },
  {
    id: "gpt-image-tokens",
    match: /gpt-image-2/,
    kind: "image-by-quality",
    imageTokens: { low: 400, medium: 1567, high: 4267 },
    note: "Derived: the per-image prices Replicate lists for gpt-image-2.5 (0.012, 0.047, 0.128) divided by OpenAI's $30 per million image tokens. OpenAI publishes no per-image table.",
    source: "https://developers.openai.com/api/docs/pricing and replicate.com/openai/gpt-image-2.5-sunburst (read 2026-10-13)",
  },
]

export const factFor = (providerAndEndpoint: string, kind: TokenFact["kind"]): TokenFact | undefined =>
  TOKEN_FACTS.find((f) => f.kind === kind && f.match.test(providerAndEndpoint.toLowerCase()))

/** A voiceover runs about 15 characters a second (roughly 150 words a minute). */
export const SPEECH_CHARS_PER_SECOND = 15

/** The length of a speech clip made from this much text */
export const speechSeconds = (chars: number): number => Math.max(1, Math.round(chars / SPEECH_CHARS_PER_SECOND))
