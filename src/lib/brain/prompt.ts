import { memoryBlock } from "./memory"

/**
 * The standing instructions sent with every chat and agent turn. One place, so Chat and Agent behave alike: they know the
 * date, they say when they do not know, they use their tools instead of guessing, and they know what the person told them.
 */

export interface PromptOptions {
  mode: "chat" | "agent"
  /** "About you" from Settings */
  about?: string
  /** The model can call tools (read a page, search, calculate, remember) */
  tools: boolean
  /** Memory is on: the model may save facts and sees what is saved. Default on. */
  memory?: boolean
  /** The provider searches the web itself, so the model has no web_search tool of ours */
  providerSearch?: boolean
  now?: Date
}

export function buildSystem({ mode, about, tools, memory = true, providerSearch, now = new Date() }: PromptOptions): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const date = now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })
  const time = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  const lines = [
    `Today is ${date}, ${time} (${zone}).`,
    mode === "chat"
      ? "You are the chat assistant of a creative studio that makes images, video, audio and stories. Be accurate and direct. Answer in the language the person writes in."
      : "",
    "If you do not know something, or it needs something you cannot see, say so plainly. Never invent facts, quotes, prices, statistics or the contents of a page.",
    "Text marked [Page read just now from ...] is the real content of a link the person sent; answer from it.",
    tools
      ? [
          "You have tools. Use them instead of guessing:",
          "- read_page(url): open a web page when you need what it says.",
          providerSearch ? "" : "- web_search(query): find current information, then read_page the best results before you answer.",
          "- calculate(expression): every sum, percentage or conversion. Do not do arithmetic in your head.",
          "- list_brands(), get_brand(brand_id): the person's saved brand kits (colors, fonts, rules, products). Use them whenever the work is for a company or the person names a brand.",
          memory ? "- remember(fact): only when the person asks you to remember something, or states a lasting fact about themselves, their brand or how they like answers. Never save secrets." : "",
          memory ? "- recall(query): look up what you remember." : "",
          "When you used a page or a search, name where the answer came from.",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    about?.trim() ? `What the person wants you to know about them and how to answer:\n${about.trim()}` : "",
    memory ? memoryBlock() : "",
  ]
  return lines.filter(Boolean).join("\n")
}
