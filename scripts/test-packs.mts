import assert from "node:assert/strict"
import crypto from "node:crypto"
import { syncChannel, type Fetcher } from "../src/lib/packs/sync.ts"
import { appAtLeast, validateManifest, validatePack } from "../src/lib/packs/validate.ts"
import { getItems, itemsOf, mergePacks } from "../src/lib/packs/store.ts"
import { sha256Hex } from "../src/lib/packs/verify.ts"
import { readTransitionUniforms } from "../src/lib/packs/glsl.ts"
import type { Pack } from "../src/lib/packs/types.ts"

let passed = 0
const check = (name: string, fn: () => void | Promise<void>) =>
  Promise.resolve(fn()).then(
    () => {
      passed++
      console.log(`PASS  ${name}`)
    },
    (e) => {
      console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : e}`)
      process.exitCode = 1
    },
  )

const enc = (v: unknown) => new TextEncoder().encode(typeof v === "string" ? v : JSON.stringify(v))
const effectPack = (version: number, extra: Partial<Pack> = {}): Pack => ({ id: "fx", title: "Fx", version, type: "effect", items: [{ id: "a", name: "A", data: { patch: { saturation: 0 } } }], ...extra })

// the built-in packs
await check("the built-in packs are all valid and offer effects, transitions and caption styles", () => {
  assert.ok(getItems("effect").length >= 50, "50 or more effects and looks")
  assert.ok(getItems("transition").length >= 35, "35 or more transitions")
  assert.ok(getItems("caption-style").length >= 25, "25 or more caption styles")
  assert.ok(getItems("text-style").length >= 15, "15 or more text styles")
  const ids = (t: "effect" | "transition" | "caption-style" | "text-style") => getItems(t).map((i) => i.id)
  for (const t of ["effect", "transition", "caption-style", "text-style"] as const) assert.equal(new Set(ids(t)).size, ids(t).length, `${t} ids are unique`)
})

await check("validation names the problem in a bad pack", () => {
  const bad = validatePack({ ...effectPack(1), items: [{ id: "a", name: "A", data: { patch: { sparkle: 3 } } }] })
  assert.ok("error" in bad && /sparkle/.test(bad.error))
  assert.ok("error" in validatePack({ ...effectPack(0) }))
  assert.ok("error" in validatePack({ ...effectPack(1), items: [{ id: "A B", name: "x", data: { patch: { blur: 1 } } }] }))
  assert.ok("error" in validatePack({ ...effectPack(1), items: [{ id: "a", name: "x", data: { patch: { blur: "lots" } } }] }))
  assert.ok("error" in validatePack({ ...effectPack(1), items: [{ id: "a", name: "x", data: { patch: { blur: 1 } } }, { id: "a", name: "y", data: { patch: { blur: 2 } } }] }), "duplicate ids")
  assert.ok("pack" in validatePack(effectPack(1)))
  // The grade, film and lens fields are known; a style may set italic as true or false
  assert.ok("pack" in validatePack({ ...effectPack(1), items: [{ id: "a", name: "A", data: { patch: { temperature: 20, grain: 30, leak: 60, leakHue: 25, shadowHue: 190 } } }] }))
  assert.ok("pack" in validatePack({ id: "c", title: "C", version: 1, type: "caption-style", items: [{ id: "x", name: "X", data: { style: { look: "neon", italic: true, case: "upper", spacing: "wide" } } }] }))
  assert.ok("error" in validatePack({ id: "c", title: "C", version: 1, type: "caption-style", items: [{ id: "x", name: "X", data: { style: { look: "rainbow" } } }] }))
})

await check("app version comparison", () => {
  assert.equal(appAtLeast("0.4.0", "0.4.0"), true)
  assert.equal(appAtLeast("0.10.0", "0.9.5"), true)
  assert.equal(appAtLeast("0.3.9", "0.4.0"), false)
  // a beta build counts as its numbers: it can use packs made for 0.1.0
  assert.equal(appAtLeast("0.1.0-beta.1", "0.1.0"), true)
  assert.equal(appAtLeast("0.1.0-beta.2", "0.0.9"), true)
  assert.equal(appAtLeast("0.1.0-beta.1", "0.2.0"), false)
})

await check("merge: higher version wins, newer-app and switched-off packs are left out", () => {
  const out = mergePacks([effectPack(1)], [effectPack(2)], "1.0.0", new Set())
  assert.equal(out.length, 1)
  assert.equal(out[0]!.version, 2)
  assert.equal(mergePacks([effectPack(1)], [effectPack(2, { minApp: "2.0.0" })], "1.0.0", new Set())[0]!.version, 1, "falls back to the built-in")
  assert.equal(mergePacks([effectPack(1)], [], "1.0.0", new Set(["fx"])).length, 0)
  const twoPacks: Pack[] = [effectPack(1), { ...effectPack(1), id: "fx2", items: [{ id: "a", name: "Other", data: { patch: { blur: 3 } } }, { id: "b", name: "B", data: { patch: { blur: 1 } } }] }]
  const items = itemsOf(twoPacks, "effect")
  assert.deepEqual(items.map((i) => i.id), ["a", "b"])
  assert.equal(items[0]!.name, "A", "first pack wins a shared id")
})

// signing and syncing with a throwaway key
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey)
const sign = async (bytes: Uint8Array) => Buffer.from(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, bytes as BufferSource))).toString("base64url")

async function publish(packs: Pack[], opts: { channel?: string; tamper?: boolean; badSignature?: boolean } = {}) {
  const files = new Map<string, Uint8Array>()
  const entries = []
  for (const p of packs) {
    const bytes = enc(p)
    files.set(`${p.id}.json`, opts.tamper ? enc({ ...p, title: "tampered" }) : bytes)
    entries.push({ id: p.id, version: p.version, type: p.type, url: `${p.id}.json`, sha256: await sha256Hex(new Uint8Array(bytes)) })
  }
  const manifest = enc({ format: 1, channel: opts.channel ?? "editor", updated: "2026-10-16", packs: entries })
  files.set("manifest.json", manifest)
  files.set("manifest.sig", enc(opts.badSignature ? "AAAA" : await sign(manifest)))
  const calls: string[] = []
  const fetcher: Fetcher = async (url, init) => {
    const name = url.split("/").pop()!
    calls.push(name)
    const body = files.get(name)
    if (!body) return new Response("no", { status: 404 })
    const etag = '"v1"'
    if (name === "manifest.json" && (init?.headers as Record<string, string> | undefined)?.["If-None-Match"] === etag) return new Response(null, { status: 304 })
    return new Response(body as BodyInit, { status: 200, headers: { ETag: etag } })
  }
  return { fetcher, calls }
}
const base = { channel: "editor" as const, source: "https://example.test/packs/", appVersion: "1.0.0", publicKey }

await check("sync takes a newer signed pack and only that", async () => {
  const { fetcher, calls } = await publish([effectPack(2), { ...effectPack(1), id: "old" }])
  const result = await syncChannel({ ...base, held: { fx: 1, old: 1 }, fetcher })
  assert.deepEqual(result.packs.map((p) => `${p.id}@${p.version}`), ["fx@2"])
  assert.ok(!calls.includes("old.json"), "an unchanged pack is not downloaded again")
  assert.equal(result.etag, '"v1"')
})

await check("sync stops when the manifest is not signed by the publisher", async () => {
  const { fetcher } = await publish([effectPack(2)], { badSignature: true })
  await assert.rejects(() => syncChannel({ ...base, held: {}, fetcher }), /not signed/)
})

await check("sync rejects a pack whose contents changed after signing", async () => {
  const { fetcher } = await publish([effectPack(2)], { tamper: true })
  const result = await syncChannel({ ...base, held: {}, fetcher })
  assert.equal(result.packs.length, 0)
  assert.match(result.skipped[0]!, /do not match the manifest/)
})

await check("sync skips a pack that needs a newer app, and reports it", async () => {
  const { fetcher } = await publish([effectPack(2, { minApp: "3.0.0" })])
  const result = await syncChannel({ ...base, held: {}, fetcher })
  assert.equal(result.packs.length, 0)
  assert.match(result.skipped[0]!, /needs app 3.0.0/)
})

await check("sync stops when the channel is wrong", async () => {
  const { fetcher } = await publish([effectPack(2)], { channel: "library" })
  await assert.rejects(() => syncChannel({ ...base, held: {}, fetcher }), /library channel/)
  assert.ok("error" in validateManifest({ format: 1, channel: "library", packs: [{ id: "fx", version: 1, type: "effect", url: "x", sha256: "0".repeat(64) }] }), "an effect pack is not allowed in the library channel")
})

await check("sync uses the ETag: unchanged means nothing is fetched", async () => {
  const { fetcher, calls } = await publish([effectPack(2)])
  const result = await syncChannel({ ...base, held: {}, fetcher, etag: '"v1"' })
  assert.equal(result.unchanged, true)
  assert.deepEqual(calls, ["manifest.json"])
})

await check("shader transitions: settings are read with their defaults, and unsafe or incomplete text is refused", () => {
  const ok = readTransitionUniforms("uniform float soft; // = 0.25\nuniform vec2 dir; // = vec2(1.0, 0.0)\nvec4 transition(vec2 uv) { return getToColor(uv); }")
  assert.ok("uniforms" in ok)
  if ("uniforms" in ok) {
    assert.deepEqual(ok.uniforms.map((u) => [u.name, u.type, u.value]), [["soft", "float", [0.25]], ["dir", "vec2", [1, 0]]])
  }
  assert.ok("error" in readTransitionUniforms("#version 300 es\nvec4 transition(vec2 uv) { return vec4(1.0); }"))
  assert.ok("error" in readTransitionUniforms("vec4 notTransition(vec2 uv) { return vec4(1.0); }"))
  assert.ok("error" in readTransitionUniforms("uniform float progress;\nvec4 transition(vec2 uv) { return vec4(1.0); }"))
  const pack = (data: object) => validatePack({ id: "t", title: "T", version: 1, type: "transition", items: [{ id: "x", name: "X", data }] })
  assert.ok("pack" in pack({ kind: "shader", glsl: "vec4 transition(vec2 uv) { return getToColor(uv); }", duration: 1 }))
  assert.ok("error" in pack({ kind: "shader", glsl: "vec4 transition(vec2 uv) { return getToColor(uv); }", params: { nope: 1 } }), "a param the shader does not declare")
  assert.ok("error" in pack({ kind: "shader" }), "no shader text")
})

await check("text layers: the look is checked, including colours, ranges, animations and unknown fields", () => {
  const pack = (rich: object) => validatePack({ id: "t", title: "T", version: 1, type: "text-style", items: [{ id: "x", name: "X", data: { text: "Hi", duration: 3, rich } }] })
  assert.ok("pack" in pack({ family: "Anton", weight: 400, size: 120, color: "#ffffff", stroke: { width: 4, color: "#000000" }, animIn: { kind: "bounce", duration: 0.5 } }))
  assert.ok("error" in pack({ color: "white" }), "a colour must be #rrggbb")
  assert.ok("error" in pack({ weight: 450 }), "weights are 100 to 900 in hundreds")
  assert.ok("error" in pack({ size: 5000 }), "size is bounded")
  assert.ok("error" in pack({ sparkle: 1 }), "unknown field")
  assert.ok("error" in pack({ animIn: { kind: "explode", duration: 1 } }), "unknown animation")
  assert.ok("error" in pack({ family: 'Evil";}' }), "a family name cannot carry code")
  assert.ok("error" in pack({ bg: { color: "#000000", opacity: 200, padX: 1, padY: 1, radius: 1 } }), "opacity is 0 to 100")
  const layers = getItems("text-style").filter((i) => i.data.rich !== undefined)
  assert.ok(layers.length >= 20, "20 or more text layers are built in")
})

console.log(`\n${passed} passed`)
if (process.exitCode) console.log("some failed")
else console.log("all passed")
