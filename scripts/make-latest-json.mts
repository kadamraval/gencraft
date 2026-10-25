/**
 * Joins what collect-installers.mts gathered on each operating system into the two folders the release workflow publishes:
 *
 *   npx tsx scripts/make-latest-json.mts <out folder> <folder holding the windows/macos/linux parts>
 *
 *   <out>/assets/   the installers and the signed update files plus SHA256SUMS: these become the files of the GitHub release
 *   <out>/pages/    the small files the website serves under /releases/: latest.json (what the desktop app's updater reads, one entry per
 *                   platform), downloads.json (what the download page shows) and SHA256SUMS
 *
 * The version comes from src-tauri/tauri.conf.json, the notes from the top section of CHANGELOG.md. The update files are signed by `tauri build`
 * with the updater key; the app checks that signature before installing. The installers are not served from Pages: GitHub's "latest release"
 * link skips pre-releases, so latest.json lives on Pages and its urls point at the release files.
 */
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const [out, parts] = process.argv.slice(2)
if (!out || !parts) throw new Error("Usage: make-latest-json.mts <out folder> <parts folder>")
const REPO = process.env.RELEASE_REPO ?? "kadamraval/gencraft"

interface Part {
  os: "windows" | "macos" | "linux"
  update: string
  signature: string
  platforms: string[]
  downloads: string[]
  dir: string
}

const version = (JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8")) as { version: string }).version
const found: Part[] = []
for (const entry of fs.readdirSync(parts)) {
  const dir = path.join(parts, entry)
  if (!fs.statSync(dir).isDirectory()) continue
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) found.push({ ...(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Omit<Part, "dir">), dir })
}
if (found.length === 0) throw new Error(`No installer parts found in ${parts}.`)

let notes = ""
if (fs.existsSync("CHANGELOG.md")) {
  const sections = fs.readFileSync("CHANGELOG.md", "utf8").split(/^## /m).slice(1)
  notes = sections[0] ? `## ${sections[0]}`.trim() : ""
}

const assets = path.join(out, "assets")
const pages = path.join(out, "pages")
fs.mkdirSync(assets, { recursive: true })
fs.mkdirSync(pages, { recursive: true })
// GitHub keeps a release file name as it is only when it has no spaces
const urlOf = (file: string) => `https://github.com/${REPO}/releases/download/v${version}/${encodeURIComponent(file)}`
const platforms: Record<string, { signature: string; url: string }> = {}
const files: Array<{ name: string; url: string; os: string; size: number; sha256: string }> = []
const labels = { windows: "Windows", macos: "macOS", linux: "Linux" }
for (const p of found) {
  for (const f of new Set(p.downloads)) {
    if (/\s/.test(f)) throw new Error(`The release file name "${f}" has a space; GitHub would rename it and the update address would break.`)
    fs.copyFileSync(path.join(p.dir, f), path.join(assets, f))
    const bytes = fs.readFileSync(path.join(assets, f))
    files.push({ name: f, url: urlOf(f), os: labels[p.os], size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") })
  }
  for (const key of p.platforms) platforms[key] = { signature: p.signature, url: urlOf(p.update) }
}
// The update files are also what the updater downloads; they stay in the release next to the plain installers
const sums = files.map((f) => `${f.sha256}  ${f.name}`).join("\n") + "\n"
fs.writeFileSync(path.join(assets, "SHA256SUMS"), sums)
fs.writeFileSync(path.join(pages, "SHA256SUMS"), sums)
fs.writeFileSync(path.join(pages, "downloads.json"), JSON.stringify({ version, beta: /-(alpha|beta|rc)/i.test(version), files }, null, 2))
fs.writeFileSync(path.join(pages, "latest.json"), JSON.stringify({ version, notes, pub_date: new Date().toISOString(), platforms }, null, 2))
fs.writeFileSync(path.join(out, "NOTES.md"), notes ? `${notes}\n` : `Gencraft ${version}\n`)
console.log(`Prepared version ${version} for ${Object.keys(platforms).join(", ")}`)
