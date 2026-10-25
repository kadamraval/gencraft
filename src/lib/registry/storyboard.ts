/**
 * Multi-shot for models that take it in the prompt.
 *
 * Wan 3.0 has no multi-shot field. Its guide says text-to-video "supports single-shot and multi-shot storyboard
 * format (4~6 seconds per shot, with timestamp annotations)": the shots are written into the prompt, each with its
 * own time range. This turns what a person writes, one shot per line, into that format.
 */

/** A line that already starts with a time range: "0s - 8s:", "0-3s:", "(0:00 - 0:03)" */
const TIMED = /^\(?\s*\d+(?::\d{2})?\s*s?\s*[-–]\s*\d+(?::\d{2})?\s*s?\s*\)?\s*:?/i

/**
 * One shot per line, with the clip's length shared out evenly in whole seconds (the last shot takes what is left).
 * A prompt of one line, or one the person has already timed, is returned as it is.
 */
export function storyboardPrompt(prompt: string, totalSeconds: number): string {
  const shots = prompt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (shots.length < 2 || shots.some((l) => TIMED.test(l))) return prompt
  const total = Math.max(shots.length, Math.round(totalSeconds))
  const each = Math.floor(total / shots.length)
  let at = 0
  return shots
    .map((shot, i) => {
      const end = i === shots.length - 1 ? total : at + each
      const line = `${at}s - ${end}s: ${shot}`
      at = end
      return line
    })
    .join("\n")
}

/** The seconds each shot gets, so the composer can warn when a shot falls outside the 4 to 6 seconds the model is built for. */
export function shotLength(prompt: string, totalSeconds: number): number | undefined {
  const shots = prompt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (shots.length < 2) return undefined
  return Math.floor(Math.max(shots.length, Math.round(totalSeconds)) / shots.length)
}
