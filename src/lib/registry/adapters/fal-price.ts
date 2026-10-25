import type { ModelPrice, PriceRule, PriceUnit } from "../types"

/**
 * fal publishes each model's price as a sentence on its model page, for example:
 *   "Your request will cost $0.025 per megapixel"
 *   "For every second of video you generate you will be charged $0.20 without audio or $0.40 with audio"
 *   "Your request will cost $0.05 per second for 480p, $0.10 per second for 720p, $0.15 per second for 1080p"
 * Prices need no key this way. The pricing API does, and is used in addition when a key exists.
 * The parser keeps to those phrasings. Anything it cannot read yields null, never a guess.
 */

const UNIT_WORDS: Array<[RegExp, PriceUnit]> = [
  [/^(?:seconds?|sec|s)\b/, "per_second"],
  [/^(?:images?|img)\b/, "per_image"],
  [/^(?:megapixels?|mp)\b/, "per_megapixel"],
  [/^(?:1,?000 characters?|1k characters?)\b/, "per_1k_chars"],
  [/^(?:1,?000,?000 tokens?|1m tokens?|million tokens?)\b/, "per_1m_tokens"],
  [/^(?:minutes?|min)\b/, "per_minute"],
  [/^(audio|video|generation|request|run|clip|call|song|track)\b/, "per_run"],
]

function unitFrom(text: string): PriceUnit | null {
  const t = text.trim().toLowerCase()
  for (const [re, unit] of UNIT_WORDS) if (re.test(t)) return unit
  return null
}

const money = (s: string): number => Number(s.replace(/,/g, "").replace(/\.$/, ""))

export interface ParsedPrice extends Pick<ModelPrice, "unit" | "amount"> {
  outputAmount?: number
  rules?: PriceRule[]
  /** Billed by the seconds it computes: the published rate for a second of machine time */
  computeSecond?: number
}

/** Reads the price out of a fal model page's visible text. Null when no known phrasing is present. */
export function parseFalPrice(pageText: string): ParsedPrice | null {
  const text = pageText.replace(/\s+/g, " ").replace(/\$\s+/g, "$")

  // 0. Per-clip tiers: "For 5s video your request will cost $0.15 for 360p and 540p, $0.2 for 720p and 1080p"
  const clip = text.match(/For (\d+)s video[^$]{0,40}\$(\d[\d.,]*) for ((?:\d{3,4}p(?:,? and | and |, )?)+)/i)
  if (clip) {
    const seconds = Number(clip[1])
    const rules: PriceRule[] = []
    for (const m of text.slice(clip.index).matchAll(/\$(\d[\d.,]*) for ((?:\d{3,4}p(?:,? and | and |, )?)+)/gi)) {
      for (const res of m[2]!.match(/\d{3,4}p/gi) ?? []) rules.push({ when: { resolution: res.toLowerCase() }, amount: money(m[1]!) / seconds })
    }
    if (rules.length >= 2) return { unit: "per_second", amount: Math.min(...rules.map((r) => r.amount)), rules }
  }

  // 1a. Combined Resolution + Audio tiers: "$0.10 per second for 720p ($0.15 with audio), $0.20 per second for 1080p ($0.30 with audio)"
  const combo = [...text.matchAll(/\$(\d[\d.,]*) per second for (\d{3,4}p|\dk)\s*\(\$(\d[\d.,]*) with audio\)/gi)]
  if (combo.length >= 1) {
    const rules: PriceRule[] = []
    for (const m of combo) {
      const res = m[2]!.toLowerCase()
      rules.push({ when: { resolution: res, generate_audio: false }, amount: money(m[1]!) })
      rules.push({ when: { resolution: res, generate_audio: true }, amount: money(m[3]!) })
    }
    return { unit: "per_second", amount: Math.min(...rules.map((r) => r.amount)), rules }
  }

  // 1b. Resolution tiers: "$0.05 per second for 480p, $0.10 per second for 720p"
  const tiers = [...text.matchAll(/\$(\d[\d.,]*) per (second|image|megapixel|video)\b[^$.]{0,12}?for (\d{3,4}p|\dk)/gi)]
  if (tiers.length >= 2) {
    const unit = unitFrom(tiers[0]![2]!)
    if (unit) {
      const rules: PriceRule[] = tiers.map((m) => ({ when: { resolution: m[3]!.toLowerCase() }, amount: money(m[1]!) }))
      return { unit, amount: Math.min(...rules.map((r) => r.amount)), rules }
    }
  }

  // 2. Audio on and off: "$0.20 without audio or $0.40 with audio", "$0.07 per second (audio off) or $0.14 per second (audio on)"
  const off = text.match(/\$(\d[\d.,]*)(?: per (second|video|image))?\s*(?:\(audio off\)|without audio|audio off)/i)
  const on = text.match(/\$(\d[\d.,]*)(?: per (second|video|image))?\s*(?:\(audio on\)|with audio|audio on)/i)
  if (off && on) {
    const unit = unitFrom(off[2] ?? on[2] ?? "second") ?? "per_second"
    const rules: PriceRule[] = [
      { when: { generate_audio: false }, amount: money(off[1]!) },
      { when: { generate_audio: true }, amount: money(on[1]!) },
    ]
    return { unit, amount: money(off[1]!), rules }
  }

  // 2b. "For every second of video you generated, you will be charged $0.42" / "flat rate of $0.20 per second"
  const perSecond = text.match(/for every second[^$]{0,60}\$(\d[\d.,]*)/i) ?? text.match(/flat rate of \$(\d[\d.,]*) per second/i)
  if (perSecond) return { unit: "per_second", amount: money(perSecond[1]!) }

  // 3. The standard sentence ("Your request will cost $0.025 per megapixel", "charged $0.05 per 1,000 characters")
  const basic = text.match(/(?:request will cost|will be charged|costs?) \$(\d[\d.,]*) (?:per|\/)\s*(?:generated )?((?:1,?000 |1k |1m |million )?[a-z]+)/i)
  if (basic) {
    const unit = unitFrom(basic[2]!)
    if (unit) return { unit, amount: money(basic[1]!) }
  }
  return parseFalSentences(text)
}

/**
 * The longer sentences fal writes in a model's own pricing note, read after the standard ones failed. Each pattern states one fact the
 * sentence really says; a sentence that mixes several units or conditions it cannot place gives null.
 */
function parseFalSentences(raw: string): ParsedPrice | null {
  const text = raw.replace(/\*\*/g, "").replace(/\\n|\n/g, " ").replace(/\s+/g, " ")

  // Time on the machine: the price is the published rate for a second of it. What one run costs depends on how long it takes, known after it.
  const compute = text.match(/\$(\d[\d.,]*)\s*(?:\/|per)\s*compute seconds?/i)
  if (compute && money(compute[1]!) > 0) return { unit: "per_run", amount: null, computeSecond: money(compute[1]!) }

  // Tentative or "from" prices: "Tentative pricing is $0.0675+ $(0.0045 x number of additional input images) per output image"
  const tentative = text.match(/(?:tentative )?pricing is \$(\d[\d.,]*)\+?.{0,90}?per (?:output )?image/i)
  if (tentative) return { unit: "per_image", amount: money(tentative[1]!) }

  // Token prices of a model that bills by tokens: "$5 per million text input tokens, $8 per million image input tokens, and $47 per million image output tokens"
  const imgIn = text.match(/\$(\d[\d.,]*) per million image input tokens/i)
  const imgOut = text.match(/\$(\d[\d.,]*) per million image output tokens/i)
  if (imgOut) return { unit: "per_1m_tokens", amount: imgIn ? money(imgIn[1]!) : money(imgOut[1]!), outputAmount: money(imgOut[1]!) }

  // A picture priced in words: "Image output: ~$0.05 per generated image", "Billing is $0.10 per generated SVG", "Billing is per generated SVG: $0.13 for low, $0.16 for medium"
  const generated = text.match(/~?\$(\d[\d.,]*) per generated (?:image|SVG)/i)
  if (generated) return { unit: "per_image", amount: money(generated[1]!) }
  const svgTiers = text.match(/per generated SVG:([^.]*(?:\.\d+[^.]*)*)/i)
  if (svgTiers) {
    const all = [...svgTiers[1]!.matchAll(/\$(\d[\d.,]*)/g)].map((m) => money(m[1]!)).filter((n) => n > 0)
    if (all.length > 0) return { unit: "per_image", amount: Math.min(...all) }
  }

  // Video tokens: "Billing is calculated per 1,000 video tokens at $0.007 for 480p and 720p"
  const vtok = text.match(/per 1,?000 (?:video )?tokens at \$(\d[\d.,]*)/i)
  if (vtok) return { unit: "per_1m_tokens", amount: money(vtok[1]!) * 1000 }

  // A price for a number of frames: "$0.022 per 30 frames", "$0.0225 per 30 frames (Refine ON) / $0.015 (OFF)"
  const frames = text.match(/\$(\d[\d.,]*)\s*(?:\/|per|for every)\s*(\d+)\s*frames/i)
  if (frames && Number(frames[2]) > 0) {
    const all = [...text.matchAll(/\$(\d[\d.,]*)/g)].map((m) => money(m[1]!)).filter((n) => n > 0)
    return { unit: "per_frame", amount: Math.min(...all) / Number(frames[2]) }
  }

  // Tokens: "Text/thinking tokens (per 1M): $1.764 input, $8.823 output."
  const tokens = text.match(/\(per 1M\):?\s*\$(\d[\d.,]*) input,?\s*\$(\d[\d.,]*) output/i)
  if (tokens) return { unit: "per_1m_tokens", amount: money(tokens[1]!), outputAmount: money(tokens[2]!) }

  // Resolution tiers of a second of video: "480p at $0.08/sec, 720p at $0.14/sec" or "$0.06/s at 540p, $0.12/s at 720p" or "1080p costs $0.0072/s, 2K costs $0.0144/s"
  const a = [...text.matchAll(/(\d{3,4}p|\d ?k)\W{0,3}(?:at |costs? |is |: ?)?\$(\d[\d.,]*)\s*(?:\/|per )\s*(?:sec(?:ond)?|s)\b/gi)].map((m) => ({ res: m[1]!.toLowerCase().replace(" ", ""), amount: money(m[2]!) }))
  const b = [...text.matchAll(/\$(\d[\d.,]*)\s*(?:\/|per )\s*(?:sec(?:ond)?|s)\b\s*(?:at|for|in)\s*(\d{3,4}p|\d ?k)/gi)].map((m) => ({ res: m[2]!.toLowerCase().replace(" ", ""), amount: money(m[1]!) }))
  const tiers = a.length >= 2 ? a : b.length >= 2 ? b : []
  if (tiers.length >= 2) return { unit: "per_second", amount: Math.min(...tiers.map((t) => t.amount)), rules: tiers.map((t) => ({ when: { resolution: t.res }, amount: t.amount })) }

  // Quality steps of one image: "$0.04 (low) or $0.06 (medium) per image for 1K" (the lowest step is the price to start from)
  const steps = text.match(/\$(\d[\d.,]*) \((?:low|medium|high|standard|hd)\)(?: or \$(\d[\d.,]*) \((?:low|medium|high|standard|hd)\))* per image/i)
  if (steps) {
    const all = [...steps[0].matchAll(/\$(\d[\d.,]*)/g)].map((m) => money(m[1]!))
    return { unit: "per_image", amount: Math.min(...all) }
  }

  // A price for a whole number of a unit: "$0.10 per 10 seconds", "$0.08 per started 24 megapixels", "$0.6 per output audio minute", "$0.07 for every second of output video".
  // The first such statement is the headline price. A charge added on top ("plus $0.01 per input image") is not.
  const spaced = text.replace(/(\d)s\b/g, "$1 seconds")
  const scaled = [...spaced.matchAll(/\$(\d[\d.,]*)\s*(?:\/|per|for every|for each)\s*(?:started\s+)?(\d+)?\s*(output |input )?(?:video |audio )?(seconds?|minutes?|megapixels?|images?)\b/gi)]
    .filter((m) => !/plus |additional|extra/i.test(spaced.slice(Math.max(0, m.index! - 14), m.index!)) && !/^input/i.test(m[3] ?? ""))
  const head = scaled[0]
  if (head) {
    const word = head[4]!
    const unit: PriceUnit = /^s/i.test(word) ? "per_second" : /^min/i.test(word) ? "per_minute" : /^mega/i.test(word) ? "per_megapixel" : "per_image"
    return { unit, amount: money(head[1]!) / Number(head[2] ?? 1) }
  }

  // A job of a stated length: "a 10-second job costs $0.10 up to 1080p" is a hundredth of a dollar a second
  const job = spaced.match(/(\d+)[- ]seconds?\b[^$]{0,90}?\$(\d[\d.,]*)/i)
  if (job && Number(job[1]) > 0) return { unit: "per_second", amount: money(job[2]!) / Number(job[1]) }

  // The first megapixel and the rest: "$0.03 for the first megapixel of output, plus $0.015 per extra megapixel" / "Pricing starts at $0.03 for the first output megapixel"
  const firstMp = text.match(/\$(\d[\d.,]*) for the first (?:output )?megapixel/i)
  if (firstMp) return { unit: "per_megapixel", amount: money(firstMp[1]!) }

  // One image, one resolution: "A 1K (1 MP) image costs $0.048"
  const oneImage = text.match(/\bimage costs? \$(\d[\d.,]*)/i)
  if (oneImage) return { unit: "per_image", amount: money(oneImage[1]!) }
  return null
}

const UNIT_OF_BILLING: Record<string, PriceUnit> = { images: "per_image", image: "per_image", seconds: "per_second", second: "per_second", megapixels: "per_megapixel", videos: "per_run", requests: "per_run", runs: "per_run", minutes: "per_minute", characters: "per_1k_chars" }

/**
 * A model page also carries the pricing as data in its script payload: the model's own note (`pricingInfoOverride`) and its billing
 * record (`endpointBilling`: unit and price). The note is read first because it states the tiers; the record is the fallback. No key is
 * needed to read either.
 */
export function parseFalPayload(html: string, endpoint?: string): ParsedPrice | null {
  const flat = html.replace(/\\"/g, '"')
  const note = /"pricingInfoOverride":"((?:[^"\\]|\\.)*)"/.exec(flat)?.[1]
  if (note && !/\$undefined/.test(note)) {
    let sentence = note
    try {
      sentence = JSON.parse(`"${note}"`) as string
    } catch {
      // read as it stands
    }
    const parsed = parseFalPrice(sentence.replace(/\*\*/g, ""))
    if (parsed) return parsed
  }
  const rec = /"endpointBilling":\{"endpoint":"([^"]+)","billing_unit":"([^"]*)","price":([0-9.]+)/.exec(flat)
  if (rec && (!endpoint || rec[1] === endpoint)) {
    const price = Number(rec[3])
    if (/^1,?000 tokens$/i.test(rec[2]!) && price > 0) return { unit: "per_1m_tokens", amount: price * 1000 }
    const unit = UNIT_OF_BILLING[rec[2]!.toLowerCase()]
    if (unit && price > 0) return { unit, amount: price }
  }
  return null
}

/** Strips a fetched HTML page down to its visible text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
}

/** Fetches and parses one model page. In the desktop app pass its HTTP fetcher; web pages cannot read fal.ai directly. Network errors and unreadable pages return null. */
export async function fetchFalPagePrice(
  endpoint: string,
  signal?: AbortSignal,
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<ParsedPrice | null> {
  // A busy page (429, 5xx) is asked again a few times; any other answer or a network failure ends the try
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetcher(`https://fal.ai/models/${endpoint}`, { signal, headers: { "User-Agent": "Mozilla/5.0" } })
      if (res.ok) {
        const html = await res.text()
        return parseFalPayload(html, endpoint) ?? parseFalPrice(htmlToText(html))
      }
      if (res.status !== 429 && res.status < 500) return null
    } catch {
      return null
    }
    await new Promise((r) => setTimeout(r, 700 * (attempt + 1)))
  }
  return null
}
