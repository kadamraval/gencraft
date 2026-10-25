import { loadBrands } from "@/lib/brand/brand-storage"
import { describeKit } from "@/lib/brand/brand-ops"
import { tool } from "ai"
import { z } from "zod"
import { readPage } from "@/lib/chat/links"
import { calculate } from "./calc"
import { addMemory, recallMemory } from "./memory"
import { searchWeb } from "./search"

/**
 * The tools Chat and the Agent share. Each one returns what it found, or says plainly why it could not, so the model
 * never has to guess. They work with any chat model that can call tools (OpenAI, Google Gemini, OpenRouter).
 */

const failure = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })

export function sharedTools(options: { providerSearch: boolean; memory?: boolean }) {
  const memory = options.memory !== false
  return {
    read_page: tool({
      description: "Open a web page and read its text. Use it when the answer depends on what a page says.",
      inputSchema: z.object({ url: z.string().describe("The full address, for example https://example.com/about") }),
      execute: async ({ url }) => {
        const clean = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
        try {
          return { url: clean, text: await readPage(clean) }
        } catch (e) {
          return { url: clean, ...failure(e), note: "The page could not be read. Say so; do not describe it." }
        }
      },
    }),
    ...(options.providerSearch
      ? {}
      : {
          web_search: tool({
            description: "Search the web for current information. Returns titles, addresses and short snippets; open the best ones with read_page.",
            inputSchema: z.object({ query: z.string().min(2) }),
            execute: async ({ query }) => {
              try {
                return { query, results: await searchWeb(query) }
              } catch (e) {
                return { query, ...failure(e), note: "Search failed. Say so; do not make up results." }
              }
            },
          }),
        }),
    list_brands: tool({
      description: "List the person's brand kits (id and name).",
      inputSchema: z.object({}),
      execute: async () => ({ brands: loadBrands().map((k) => ({ id: k.id, name: k.name })) }),
    }),
    get_brand: tool({
      description: "Read one brand kit: name, website, tagline, colors, fonts, rules and products. Use it for anything written or made for a company.",
      inputSchema: z.object({ brand_id: z.string() }),
      execute: async ({ brand_id }) => {
        const kit = loadBrands().find((k) => k.id === brand_id)
        return kit ? { name: kit.name, kit: describeKit(kit) } : { error: "There is no brand kit with that id. Call list_brands." }
      },
    }),
    calculate: tool({
      description: "Calculate a number. Supports + - * / ^ %, brackets, sqrt, abs, round, floor, ceil, min, max, pow, log, ln, sin, cos, tan, pi.",
      inputSchema: z.object({ expression: z.string().describe("For example (1299 * 3) * 1.18") }),
      execute: async ({ expression }) => {
        try {
          return { expression, result: calculate(expression) }
        } catch (e) {
          return { expression, ...failure(e) }
        }
      },
    }),
    ...(memory ? { remember: tool({
      description: "Save a lasting fact about the person, their brand or how they like answers, so every later chat knows it. Keep it to one short sentence.",
      inputSchema: z.object({ fact: z.string().min(3).max(300) }),
      execute: async ({ fact }) => {
        const saved = addMemory(fact)
        return saved.ok ? { saved: saved.memory.text } : { saved: false, reason: saved.reason }
      },
    }),
    recall: tool({
      description: "Look up what you remember about the person. Pass a topic, or nothing for everything.",
      inputSchema: z.object({ query: z.string().optional() }),
      execute: async ({ query }) => ({ memories: recallMemory(query ?? "").map((m) => m.text) }),
    }) } : {}),
  }
}

export type SharedTools = ReturnType<typeof sharedTools>
