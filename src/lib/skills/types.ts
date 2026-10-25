export type SkillScope = "chat" | "agent" | "image" | "video" | "audio"

/**
 * A skill is a saved way of working. It does two things, depending on where it is used:
 *  - in Image, Video and Audio, its `phrase` is added after your own words;
 *  - in Chat and Agent, its `method` is given to the model as how to do the work.
 */
export interface Skill {
  id: string
  name: string
  description: string
  appliesTo: SkillScope[]
  /** Added to image, video and audio prompts. May be empty. */
  phrase: string
  /** Given to chat and the agent as the method to follow. May be empty. */
  method: string
  origin: "preset" | "user"
  /** Words that suggest this skill while typing */
  triggers?: string[]
}
