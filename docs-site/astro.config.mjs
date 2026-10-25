import { defineConfig } from "astro/config"
import starlight from "@astrojs/starlight"

// The site is served by GitHub Pages from the public repository's website branch, under /gencraft/docs. With a domain later, change `site` and
// set DOCS_BASE to /.
export default defineConfig({
  site: process.env.DOCS_SITE ?? "https://kadamraval.github.io",
  base: process.env.DOCS_BASE ?? "/gencraft/docs",
  integrations: [
    starlight({
      title: "Gencraft",
      description: "Gencraft is a desktop AI studio for images, video, voice and finished stories, using your own provider keys. Guides, models and prices, downloads and how to contribute.",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/kadamraval/gencraft" }],
      sidebar: [
        { label: "Start here", items: [{ label: "Download", slug: "download" }] },
        { label: "User guide", items: [{ autogenerate: { directory: "guide" } }] },
        { label: "Models and prices", items: [{ autogenerate: { directory: "models" } }] },
        { label: "Community", items: [{ label: "Contributing", slug: "contributing" }, { label: "Changelog", slug: "changelog" }] },
      ],
    }),
  ],
})
