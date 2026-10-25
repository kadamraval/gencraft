/**
 * Copies the brand SVGs the logo rules need from @lobehub/icons-static-svg into src/assets/logos.
 * Prefers the `-color` variant; falls back to the mono icon (which uses currentColor and follows the theme).
 *
 *   npm run logos:sync
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { ALL_SLUGS } from "../src/lib/registry/logo-rules.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const src = path.resolve(here, "../node_modules/@lobehub/icons-static-svg/icons")
const dest = path.resolve(here, "../src/assets/logos")
fs.mkdirSync(dest, { recursive: true })

const missing: string[] = []
let copied = 0
for (const slug of ALL_SLUGS) {
  const color = path.join(src, `${slug}-color.svg`)
  const mono = path.join(src, `${slug}.svg`)
  const pick = fs.existsSync(color) ? color : fs.existsSync(mono) ? mono : null
  if (!pick) {
    missing.push(slug)
    continue
  }
  fs.copyFileSync(pick, path.join(dest, `${slug}.svg`))
  copied++
}
console.log(`Copied ${copied}/${ALL_SLUGS.length} logos to src/assets/logos`)
if (missing.length) console.log(`No icon for: ${missing.join(", ")} (these fall back to the provider logo or a monogram)`)
