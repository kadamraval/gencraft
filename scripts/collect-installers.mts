/**
 * After `tauri build` on one operating system: copies the installers and the signed update file into a folder and writes a small description of
 * them, so the release workflow can join the three systems into one latest.json.
 *
 *   npx tsx scripts/collect-installers.mts <windows|macos|linux> <out folder>
 *
 * The update file is the one the desktop app downloads to update itself (it carries a .sig made with the updater key); the other files
 * (dmg, deb, rpm, msi) are plain downloads for people installing the first time.
 */
import fs from "node:fs"
import path from "node:path"

const [os, out] = process.argv.slice(2)
if (!os || !out || !["windows", "macos", "linux"].includes(os)) throw new Error("Usage: collect-installers.mts <windows|macos|linux> <out folder>")

const bundleRoots = ["src-tauri/target/release/bundle", "src-tauri/target/universal-apple-darwin/release/bundle"].filter((d) => fs.existsSync(d))
if (bundleRoots.length === 0) throw new Error("No bundle folder found: did tauri build run?")

const find = (sub: string, suffix: string): string[] =>
  bundleRoots.flatMap((root) => {
    const dir = path.join(root, sub)
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(suffix)).map((f) => path.join(dir, f)) : []
  })

/** The file the updater downloads, and the platform keys it serves */
const UPDATE: Record<string, { sub: string; suffix: string; platforms: string[] }> = {
  windows: { sub: "nsis", suffix: "-setup.exe", platforms: ["windows-x86_64"] },
  macos: { sub: "macos", suffix: ".app.tar.gz", platforms: ["darwin-aarch64", "darwin-x86_64"] },
  linux: { sub: "appimage", suffix: ".AppImage", platforms: ["linux-x86_64"] },
}
const PLAIN: Record<string, Array<{ sub: string; suffix: string }>> = {
  windows: [{ sub: "msi", suffix: ".msi" }],
  macos: [{ sub: "dmg", suffix: ".dmg" }],
  linux: [{ sub: "deb", suffix: ".deb" }, { sub: "rpm", suffix: ".rpm" }],
}

fs.mkdirSync(out, { recursive: true })
const spec = UPDATE[os]!
const update = find(spec.sub, spec.suffix)[0]
if (!update) throw new Error(`No ${spec.suffix} found in the ${spec.sub} bundle.`)
const sig = `${update}.sig`
if (!fs.existsSync(sig)) throw new Error(`${sig} is missing: the build was not signed (TAURI_SIGNING_PRIVATE_KEY).`)
fs.copyFileSync(update, path.join(out, path.basename(update)))

const downloads: string[] = []
for (const p of PLAIN[os]!) for (const f of find(p.sub, p.suffix)) {
  fs.copyFileSync(f, path.join(out, path.basename(f)))
  downloads.push(path.basename(f))
}
fs.writeFileSync(
  path.join(out, `${os}.json`),
  JSON.stringify({ os, update: path.basename(update), signature: fs.readFileSync(sig, "utf8").trim(), platforms: spec.platforms, downloads: [path.basename(update), ...downloads] }, null, 2),
)
console.log(`${os}: update file ${path.basename(update)}, plain downloads ${downloads.join(", ") || "none"}`)
