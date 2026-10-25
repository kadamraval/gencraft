import type { Skill, SkillScope } from "./types"

/**
 * Skills as plain text files, so they can be shared and kept in a repository:
 *
 *   ---
 *   name: Product packshot
 *   description: Clean e-commerce shot with a believable shadow
 *   applies-to: image, video, chat, agent
 *   triggers: product, packshot
 *   ---
 *   ## Prompt phrase
 *   ...text added to image, video and audio prompts...
 *   ## Method
 *   ...how chat and the agent should work...
 */

const SCOPES: SkillScope[] = ["chat", "agent", "image", "video", "audio"]

export function serializeSkill(skill: Pick<Skill, "name" | "description" | "appliesTo" | "phrase" | "method" | "triggers">): string {
  const lines = ["---", `name: ${skill.name}`, `description: ${skill.description}`, `applies-to: ${skill.appliesTo.join(", ")}`]
  if (skill.triggers?.length) lines.push(`triggers: ${skill.triggers.join(", ")}`)
  lines.push("---")
  if (skill.phrase.trim()) lines.push("## Prompt phrase", skill.phrase.trim())
  if (skill.method.trim()) lines.push("## Method", skill.method.trim())
  return `${lines.join("\n")}\n`
}

export function parseSkill(text: string): Omit<Skill, "id" | "origin"> | { error: string } {
  const m = text.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { error: "The file must start with a block between two --- lines." }
  const meta: Record<string, string> = {}
  for (const line of m[1]!.split("\n")) {
    const i = line.indexOf(":")
    if (i > 0) meta[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim()
  }
  if (!meta.name) return { error: "The file needs a name: line." }
  const appliesTo = (meta["applies-to"] ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s): s is SkillScope => (SCOPES as string[]).includes(s))
  if (appliesTo.length === 0) return { error: "applies-to must list at least one of: chat, agent, image, video, audio." }

  const body = m[2]!
  const section = (title: string): string => {
    const re = new RegExp(`^##\\s*${title}\\s*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, "mi")
    return body.match(re)?.[1]?.trim() ?? ""
  }
  const phrase = section("Prompt phrase")
  const method = section("Method")
  if (!phrase && !method) return { error: "The file needs a Prompt phrase or a Method section." }
  const triggers = (meta.triggers ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  return { name: meta.name, description: meta.description ?? "", appliesTo, phrase, method, ...(triggers.length ? { triggers } : {}) }
}
