/**
 * Makes and signs license keys. Keys are checked inside the app with a public key, so nothing has to be online.
 *
 *   npx tsx scripts/license.mts keygen             once: makes the signing key (keep .license/ safe and private)
 *   npx tsx scripts/license.mts issue "Name <mail>" [year|lifetime]  prints a license key to give a buyer (default lifetime; year works for 366 days)
 *
 * The private key never goes in the repository. Whoever holds it can make keys.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.resolve(here, "../.license")
const privateFile = path.join(dir, "private.jwk.json")
const publicFile = path.resolve(here, "../src/lib/license-public.json")
const b64url = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url")
const alg = { name: "ECDSA", namedCurve: "P-256" } as const

const [command, ...rest] = process.argv.slice(2)

if (command === "keygen") {
  if (fs.existsSync(privateFile)) {
    console.log("A signing key already exists. Delete .license/private.jwk.json only if you want to invalidate every license already sold.")
    process.exit(1)
  }
  const pair = await crypto.subtle.generateKey(alg, true, ["sign", "verify"])
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(privateFile, JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey), null, 2))
  fs.writeFileSync(publicFile, JSON.stringify(await crypto.subtle.exportKey("jwk", pair.publicKey), null, 2))
  console.log(`Private key: ${path.relative(process.cwd(), privateFile)} (back it up, never commit it)\nPublic key written to ${path.relative(process.cwd(), publicFile)}`)
} else if (command === "issue") {
  const term = rest[rest.length - 1] === "year" || rest[rest.length - 1] === "lifetime" ? (rest.pop() as "year" | "lifetime") : "lifetime"
  const licensee = rest.join(" ").trim()
  if (!licensee) {
    console.log('Usage: npx tsx scripts/license.mts issue "Name <mail>" [year|lifetime]')
    process.exit(1)
  }
  const privateKey = await crypto.subtle.importKey("jwk", JSON.parse(fs.readFileSync(privateFile, "utf8")), alg, false, ["sign"])
  const payload = new TextEncoder().encode(JSON.stringify({ plan: "paid", licensee, issued: new Date().toISOString().slice(0, 10), term, ...(term === "year" ? { expires: new Date(Date.now() + 366 * 86400000).toISOString().slice(0, 10) } : {}) }))
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, payload)
  console.log(`GC-${b64url(payload)}.${b64url(signature)}`)
} else {
  console.log("Commands: keygen, issue")
}
