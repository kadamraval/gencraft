/**
 * Signs the standard model database so the app can trust it.
 *
 *   npx tsx scripts/sign-knowledge.mts <out folder>
 *
 * Copies src/lib/knowledge/pack.json to <out>/pack.json and writes <out>/pack.sig, an ECDSA P-256 signature of exactly those bytes. The
 * private key is the same one the content packs use: the secret PACKS_PRIVATE_KEY (a JWK) in a GitHub Action, or .license/packs-private.jwk.json
 * on a developer machine. It is never written anywhere. The pack is checked first; one that fails its gate is not signed.
 */
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { validatePack } from "../src/lib/knowledge/schema.ts"
import type { KnowledgePack } from "../src/lib/knowledge/schema.ts"

const out = process.argv[2]
if (!out) throw new Error("Usage: sign-knowledge.mts <out folder>")
const source = "src/lib/knowledge/pack.json"
const bytes = fs.readFileSync(source)
const problems = validatePack(JSON.parse(bytes.toString("utf8")) as KnowledgePack)
if (problems.length > 0) throw new Error(`The database fails its checks, so it is not signed: ${problems[0]}`)

const jwkText = process.env.PACKS_PRIVATE_KEY ?? (fs.existsSync(".license/packs-private.jwk.json") ? fs.readFileSync(".license/packs-private.jwk.json", "utf8") : "")
if (!jwkText) throw new Error("No signing key: set PACKS_PRIVATE_KEY or run `npx tsx scripts/packs.mts keygen` first.")
const key = await crypto.subtle.importKey("jwk", JSON.parse(jwkText), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])
const signature = Buffer.from(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new Uint8Array(bytes))).toString("base64url")

fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, "pack.json"), bytes)
fs.writeFileSync(path.join(out, "pack.sig"), signature)
console.log(`Signed ${bytes.byteLength} bytes into ${out}`)
