/**
 * Content packs: check, sign and bundle them.
 *
 *   npx tsx scripts/packs.mts keygen                       once: makes the signing key (keep .license/ private)
 *   npx tsx scripts/packs.mts validate <folder>            checks every pack in <folder>/packs
 *   npx tsx scripts/packs.mts build <folder> <out> <channel>  validates, copies the packs to <out>, writes manifest.json and manifest.sig
 *   npx tsx scripts/packs.mts bundle                        puts content/editor-packs and content/library-packs into the app's built-in baseline
 *
 * The private key never goes in a repository. In a content repository's GitHub Action it is the secret PACKS_PRIVATE_KEY.
 * The app carries the public key (src/lib/packs/packs-public.json) and ignores anything not signed with the private one.
 */
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { validateManifest, validatePack } from "../src/lib/packs/validate.ts"
import { CHANNEL_OF } from "../src/lib/packs/types.ts"
import type { Channel, Manifest, Pack } from "../src/lib/packs/types.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const keyDir = path.join(root, ".license")
const privateFile = path.join(keyDir, "packs-private.jwk.json")
const publicFile = path.join(root, "src/lib/packs/packs-public.json")
const alg = { name: "ECDSA", namedCurve: "P-256" } as const
const b64url = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url")

function readPacks(folder: string): { file: string; bytes: Buffer; pack: Pack }[] {
  const dir = path.join(folder, "packs")
  if (!fs.existsSync(dir)) throw new Error(`There is no packs folder in ${folder}`)
  const out: { file: string; bytes: Buffer; pack: Pack }[] = []
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const bytes = fs.readFileSync(path.join(dir, file))
    const result = validatePack(JSON.parse(bytes.toString("utf8")))
    if ("error" in result) throw new Error(`${file}: ${result.error}`)
    out.push({ file, bytes, pack: result.pack })
  }
  const ids = new Set<string>()
  for (const { pack, file } of out) {
    if (ids.has(pack.id)) throw new Error(`${file}: the pack id "${pack.id}" is used by another file`)
    ids.add(pack.id)
  }
  return out
}

// ---- templates for the standalone content repositories

const workflow = (channel: Channel) => `name: Publish ${channel} packs
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install --no-audit --no-fund
      - run: npm run validate
      - run: npm run build
        env:
          PACKS_PRIVATE_KEY: \${{ secrets.PACKS_PRIVATE_KEY }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`

const readme = (channel: Channel) => `# Gencraft ${channel} content packs

${channel === "editor" ? "Effects, transitions, caption styles, text styles and overlays" : "Elements and templates"} for the Gencraft app, as signed data packs. The app checks this repository's published address once a day and uses anything newer, so adding or improving content here reaches every user without an app update.

## Add or change content
1. Edit or add a file in \`packs/\` (one pack per file). A pack is \`{ id, title, version, type, license, items }\`.
2. Raise the pack's \`version\` whenever you change it. The app only takes a higher version than the one it has.
3. Run \`npm install\` once, then \`npm run validate\`. It names the first problem in any pack.
4. Push to \`main\`. The GitHub Action validates, signs and publishes to GitHub Pages.

## One-time setup
- Repository settings, Pages: source "GitHub Actions".
- Repository secret \`PACKS_PRIVATE_KEY\`: the contents of \`.license/packs-private.jwk.json\` from the app repository (made by \`npx tsx scripts/packs.mts keygen\`). Never commit that file.
- In the app, Settings, Content packs: paste this repository's Pages address (for example \`https://<you>.github.io/<repo>/\`).

## Rules
- Data only: values for controls the app already has. No code. A pack that needs a newer app says so with \`minApp\`.
- Anything imported from elsewhere needs its licence named in the pack's \`license\` field.
- Large media does not belong here: keep only metadata and a hash, and host the file on a CDN.
`

const standaloneCli = `import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { validateManifest, validatePack } from "./validate.ts"
import { CHANNEL_OF } from "./types.ts"
import type { Channel, Manifest, Pack } from "./types.ts"

const alg = { name: "ECDSA", namedCurve: "P-256" } as const
const b64url = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url")

function readPacks(folder: string): { file: string; bytes: Buffer; pack: Pack }[] {
  const dir = path.join(folder, "packs")
  const out: { file: string; bytes: Buffer; pack: Pack }[] = []
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const bytes = fs.readFileSync(path.join(dir, file))
    const result = validatePack(JSON.parse(bytes.toString("utf8")))
    if ("error" in result) throw new Error(file + ": " + result.error)
    out.push({ file, bytes, pack: result.pack })
  }
  const ids = new Set<string>()
  for (const { pack, file } of out) {
    if (ids.has(pack.id)) throw new Error(file + ": the pack id " + pack.id + " is used by another file")
    ids.add(pack.id)
  }
  return out
}

const [command, ...args] = process.argv.slice(2)
if (command === "validate") {
  const packs = readPacks(path.resolve(args[0] ?? "."))
  console.log(packs.length + " pack(s) are fine")
} else if (command === "build") {
  const [folderArg, outArg, channel] = args as [string, string, Channel]
  const packs = readPacks(path.resolve(folderArg))
  for (const { pack, file } of packs) if (CHANNEL_OF[pack.type] !== channel) throw new Error(file + ": a " + pack.type + " pack does not belong in the " + channel + " channel")
  const out = path.resolve(outArg)
  fs.mkdirSync(out, { recursive: true })
  const manifest: Manifest = {
    format: 1,
    channel,
    updated: new Date().toISOString(),
    packs: packs.map(({ file, bytes, pack }) => {
      fs.writeFileSync(path.join(out, file), bytes)
      return { id: pack.id, version: pack.version, type: pack.type, url: file, sha256: crypto.createHash("sha256").update(bytes).digest("hex") }
    }),
  }
  const check = validateManifest(manifest)
  if ("error" in check) throw new Error(check.error)
  if (!process.env.PACKS_PRIVATE_KEY) throw new Error("The secret PACKS_PRIVATE_KEY is not set, so the packs cannot be signed.")
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2))
  const key = await crypto.subtle.importKey("jwk", JSON.parse(process.env.PACKS_PRIVATE_KEY), alg, false, ["sign"])
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, manifestBytes)
  fs.writeFileSync(path.join(out, "manifest.json"), manifestBytes)
  fs.writeFileSync(path.join(out, "manifest.sig"), b64url(signature))
  console.log("Built " + manifest.packs.length + " pack(s), signed.")
} else {
  console.log("Commands: validate, build")
}
`

const [command, ...args] = process.argv.slice(2)

if (command === "keygen") {
  if (fs.existsSync(privateFile)) {
    console.log("A pack signing key already exists. Delete .license/packs-private.jwk.json only if you are ready to re-sign every pack and ship a new app.")
    process.exit(1)
  }
  const pair = await crypto.subtle.generateKey(alg, true, ["sign", "verify"])
  fs.mkdirSync(keyDir, { recursive: true })
  fs.writeFileSync(privateFile, JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey), null, 2))
  fs.writeFileSync(publicFile, JSON.stringify(await crypto.subtle.exportKey("jwk", pair.publicKey), null, 2))
  console.log(`Private key: ${path.relative(process.cwd(), privateFile)} (back it up, never commit it; put it in the content repositories as the secret PACKS_PRIVATE_KEY)\nPublic key written to ${path.relative(process.cwd(), publicFile)}`)
} else if (command === "validate") {
  const folder = path.resolve(args[0] ?? "")
  const packs = readPacks(folder)
  console.log(`${packs.length} pack(s) are fine: ${packs.map((p) => `${p.pack.id}@${p.pack.version} (${p.pack.items.length})`).join(", ")}`)
} else if (command === "build") {
  const [folderArg, outArg, channelArg] = args
  const channel = channelArg as Channel
  if (!folderArg || !outArg || (channel !== "editor" && channel !== "library")) {
    console.log("Usage: npx tsx scripts/packs.mts build <folder> <out> <editor|library>")
    process.exit(1)
  }
  const packs = readPacks(path.resolve(folderArg))
  for (const { pack, file } of packs) if (CHANNEL_OF[pack.type] !== channel) throw new Error(`${file}: a ${pack.type} pack does not belong in the ${channel} channel`)
  const out = path.resolve(outArg)
  fs.mkdirSync(out, { recursive: true })
  const manifest: Manifest = {
    format: 1,
    channel,
    updated: new Date().toISOString(),
    packs: packs.map(({ file, bytes, pack }) => {
      fs.writeFileSync(path.join(out, file), bytes)
      return { id: pack.id, version: pack.version, type: pack.type, url: file, sha256: crypto.createHash("sha256").update(bytes).digest("hex") }
    }),
  }
  const check = validateManifest(manifest)
  if ("error" in check) throw new Error(check.error)
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2))
  const jwk = process.env.PACKS_PRIVATE_KEY ? JSON.parse(process.env.PACKS_PRIVATE_KEY) : JSON.parse(fs.readFileSync(privateFile, "utf8"))
  const key = await crypto.subtle.importKey("jwk", jwk, alg, false, ["sign"])
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, manifestBytes)
  fs.writeFileSync(path.join(out, "manifest.json"), manifestBytes)
  fs.writeFileSync(path.join(out, "manifest.sig"), b64url(signature))
  console.log(`Built ${manifest.packs.length} pack(s) into ${path.relative(process.cwd(), out)}, signed.`)
} else if (command === "bundle") {
  const all: Pack[] = []
  for (const folder of ["content/editor-packs", "content/library-packs"]) {
    const dir = path.join(root, folder)
    if (fs.existsSync(path.join(dir, "packs"))) all.push(...readPacks(dir).map((p) => p.pack))
  }
  const target = path.join(root, "src/lib/packs/baseline.json")
  fs.writeFileSync(target, JSON.stringify({ packs: all }, null, 2) + "\n")
  console.log(`Baseline: ${all.length} pack(s), ${all.reduce((n, p) => n + p.items.length, 0)} item(s) written to ${path.relative(process.cwd(), target)}`)
} else if (command === "scaffold") {
  // Makes a folder into a standalone content repository: its own validator and signer, a README and the GitHub Action that publishes it
  const [folderArg, channelArg] = args
  const channel = channelArg as Channel
  if (!folderArg || (channel !== "editor" && channel !== "library")) {
    console.log("Usage: npx tsx scripts/packs.mts scaffold <folder> <editor|library>")
    process.exit(1)
  }
  const folder = path.resolve(folderArg)
  const tools = path.join(folder, "tools")
  fs.mkdirSync(path.join(folder, "packs"), { recursive: true })
  fs.mkdirSync(tools, { recursive: true })
  fs.mkdirSync(path.join(folder, ".github/workflows"), { recursive: true })
  const copy = (from: string, to: string, fix?: (t: string) => string) => {
    const text = fs.readFileSync(path.join(root, from), "utf8")
    fs.writeFileSync(path.join(tools, to), fix ? fix(text) : text)
  }
  copy("src/lib/packs/validate.ts", "validate.ts", (t) => t.replace('from "./types"', 'from "./types.ts"').replace('from "./glsl"', 'from "./glsl.ts"'))
  copy("src/lib/packs/types.ts", "types.ts")
  copy("src/lib/packs/glsl.ts", "glsl.ts")
  fs.writeFileSync(path.join(tools, "cli.mts"), standaloneCli)
  const pkgJson = { name: `gencraft-${channel}-packs`, private: true, type: "module", scripts: { validate: "tsx tools/cli.mts validate .", build: `tsx tools/cli.mts build . dist ${channel}` }, devDependencies: { tsx: "^4.19.0" } }
  fs.writeFileSync(path.join(folder, "package.json"), JSON.stringify(pkgJson, null, 2) + "\n")
  fs.writeFileSync(path.join(folder, ".gitignore"), "node_modules\ndist\n")
  fs.writeFileSync(path.join(folder, ".github/workflows/publish.yml"), workflow(channel))
  fs.writeFileSync(path.join(folder, "README.md"), readme(channel))
  console.log(`Scaffolded ${path.relative(process.cwd(), folder)} as the ${channel} content repository.`)
} else {
  console.log("Commands: keygen, validate, build, bundle, scaffold")
}
