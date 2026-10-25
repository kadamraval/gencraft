/**
 * Camera moves for a model that takes them as commands in the prompt. MiniMax Hailuo reads `[Pan left]`, `[Push in]`,
 * and several in one bracket (`[Pan left,Pedestal up]`, at most 3) for a move that happens together; separate brackets
 * run one after another. Natural words also work, but its own page says the commands are more accurate.
 * Source: platform.minimax.io/docs/api-reference/video-generation-t2v (read 2026-10-13).
 */

export const HAILUO_COMMANDS = [
  "Truck left", "Truck right", "Pan left", "Pan right", "Push in", "Pull out", "Pedestal up", "Pedestal down",
  "Tilt up", "Tilt down", "Zoom in", "Zoom out", "Shake", "Tracking shot", "Static shot",
] as const

/** Words a person (or a camera element) uses, and the command each means. The first listed match wins. */
const WORDS: Array<[RegExp, (typeof HAILUO_COMMANDS)[number]]> = [
  [/\b(push[- ]?in|dolly[- ]?in|move in|approach)/i, "Push in"],
  [/\b(pull[- ]?out|pull back|dolly[- ]?out|move away)/i, "Pull out"],
  [/\bpan(ning)? left/i, "Pan left"],
  [/\bpan(ning)? right/i, "Pan right"],
  [/\btruck(ing)? left/i, "Truck left"],
  [/\btruck(ing)? right/i, "Truck right"],
  [/\b(tilt(ing)? up|crane up)/i, "Tilt up"],
  [/\b(tilt(ing)? down|crane down)/i, "Tilt down"],
  [/\b(pedestal up|boom up)/i, "Pedestal up"],
  [/\b(pedestal down|boom down)/i, "Pedestal down"],
  [/\bzoom(ing)? in/i, "Zoom in"],
  [/\bzoom(ing)? out/i, "Zoom out"],
  [/\b(handheld|shaky|shake)/i, "Shake"],
  [/\b(tracking|follow(ing)? shot|follow cam)/i, "Tracking shot"],
  [/\b(static|locked[- ]off|still camera|fixed camera)/i, "Static shot"],
]

/** The commands the words ask for, at most three, in the order they are first said. */
export function cameraCommands(text: string): string[] {
  const found: Array<{ at: number; cmd: string }> = []
  for (const [re, cmd] of WORDS) {
    const m = re.exec(text)
    if (m && !found.some((f) => f.cmd === cmd)) found.push({ at: m.index, cmd })
  }
  return found.sort((a, b) => a.at - b.at).slice(0, 3).map((f) => f.cmd)
}

/** The prompt with the moves written as one command bracket in front. Left alone when it already has a bracket. */
export function withCameraCommands(prompt: string, commands: string[]): string {
  if (commands.length === 0 || /\[[A-Za-z ,]+\]/.test(prompt)) return prompt
  return `[${commands.join(",")}] ${prompt}`
}

/** More than three moves in one bracket is outside what the maker documents. */
export const lintCamera = (prompt: string): string[] => {
  const out: string[] = []
  for (const m of prompt.matchAll(/\[([^\]]+)\]/g)) if (m[1]!.split(",").length > 3) out.push("Use at most 3 camera moves in one bracket.")
  return out
}
