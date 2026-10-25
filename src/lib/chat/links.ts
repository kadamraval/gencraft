import { appFetch, isDesktopApp } from "@/lib/registry/net"

/**
 * Chat reads the links in a message. A model cannot open a web page by itself (only a provider's own search tool can),
 * and one that is asked will often invent an answer from the name alone. So the app opens each link, takes the page's
 * text, and sends it with the question. A page that cannot be opened is said so, and the model is told not to guess.
 */

const MAX_LINKS = 3
const PAGE_CHARS = 12_000

const LINK = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|in|org|net|io|co|ai|app|dev|shop|store|info|me|us|uk|de|fr|edu|gov|tv|xyz|online|site|tech)\b(?:\/[^\s<>"')\]]*)?/gi

/** The web addresses written in a message, with or without https://, in order and without repeats. */
export function findLinks(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(LINK)) {
    // An email address is not a link
    if (text[(m.index ?? 0) - 1] === "@") continue
    const raw = m[0].replace(/[.,;:!?]+$/, "")
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    if (!out.includes(url)) out.push(url)
  }
  return out.slice(0, MAX_LINKS)
}

async function fetchPage(url: string): Promise<string> {
  const res = isDesktopApp() ? await appFetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }) : await fetch(`/api/proxy/site?url=${encodeURIComponent(url)}`)
  if (!res.ok) throw new Error(`the site answered ${res.status}`)
  return res.text()
}

const squash = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim()

/** The readable text of a page: title, description and body, without scripts, menus and styles. */
export async function readPage(url: string): Promise<string> {
  const html = await fetchPage(url)
  const doc = new DOMParser().parseFromString(html, "text/html")
  const meta = (key: string) => squash(doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`)?.getAttribute("content"))
  const title = squash(doc.querySelector("title")?.textContent)
  const description = meta("og:description") || meta("description")
  doc.querySelectorAll("script, style, noscript, svg, iframe, nav, footer, form").forEach((n) => n.remove())
  const body = squash((doc.querySelector("main") ?? doc.body)?.textContent)
  const text = [title && `Title: ${title}`, description && `Description: ${description}`, body && `Text: ${body}`].filter(Boolean).join("\n")
  if (text.length < 40) throw new Error("the page has no readable text (it may load its content with scripts)")
  return text.slice(0, PAGE_CHARS)
}

/**
 * The message with the pages it links to written in front of it. Returns the message as it was when it has no links.
 * `notes` says what was read, so the chat can tell the person.
 */
export async function withLinkedPages(message: string): Promise<{ text: string; notes: string[] }> {
  const links = findLinks(message)
  if (links.length === 0) return { text: message, notes: [] }
  const blocks: string[] = []
  const notes: string[] = []
  await Promise.all(
    links.map(async (url, i) => {
      try {
        blocks[i] = `[Page read just now from ${url}]\n${await readPage(url)}`
        notes.push(`Read ${url}`)
      } catch (e) {
        const why = e instanceof Error ? e.message : "it could not be opened"
        blocks[i] = `[The app could NOT read ${url}: ${why}. Do not describe this page or guess what is on it. Say plainly that it could not be opened and why, and offer to help if the person pastes the text.]`
        notes.push(`Could not read ${url}`)
      }
    }),
  )
  return { text: `${blocks.join("\n\n")}\n\n[The person's message]\n${message}`, notes }
}
