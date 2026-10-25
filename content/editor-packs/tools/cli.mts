import crypto from "node:crypto"
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
