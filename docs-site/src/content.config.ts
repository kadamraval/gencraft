import { defineCollection } from "astro:content"
import { docsLoader } from "@astrojs/starlight/loaders"
import { docsSchema } from "@astrojs/starlight/schema"
import { z } from "astro/zod"

// `id`, `group` and `order` are read by scripts/build-help.mts to make the in-app Help from the same files.
export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({ extend: z.object({ id: z.string().optional(), group: z.string().optional(), order: z.number().optional() }) }),
  }),
}
