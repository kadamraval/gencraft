import { readFileSync } from "node:fs"
import { familyKey, familyOf, findSibling, mergeRefs } from "../src/lib/registry/families"
import { rowChips } from "../src/lib/registry/summary"
import type { ModelRecord } from "../src/lib/registry/types"

let fails = 0
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`)
  if (!ok) fails++
}
const rec = (provider: string, endpoint: string, task: string, modality: ModelRecord["modality"] = "video"): ModelRecord =>
  ({ id: `${provider}/${endpoint}`, endpoint, name: endpoint, provider, modality, task, family: endpoint, logoKey: "", inputs: ["text"], params: { type: "object", properties: {} }, price: { unit: "unknown", amount: null, source: "estimate", fetchedAt: "" }, status: "active" }) as ModelRecord

// Replicate names its versions with t2v, i2v and r2v
const rep = ["wan-video/wan-2.7-t2v", "wan-video/wan-2.7-i2v", "wan-video/wan-2.7-r2v", "wan-video/wan-2.7-videoedit"].map((e, i) => rec("replicate", e, ["text-to-video", "image-to-video", "image-to-video", "image-to-video"][i]!))
const imageModel = rec("replicate", "wan-video/wan-2.7-image", "image-to-image", "image")
const other = [rec("replicate", "wan-video/wan-2.6-t2v", "text-to-video"), rec("replicate", "alibaba/wan-3", "image-to-video"), rec("replicate", "alibaba/wan-3-prime", "image-to-video")]
const pool = [...rep, imageModel, ...other]
check("Replicate's t2v, i2v and r2v are one family", familyKey(rep[0]!) === familyKey(rep[1]!) && familyKey(rep[1]!) === familyKey(rep[2]!))
check("another version of the model is another family", familyKey(rep[0]!) !== familyKey(other[0]!))
check("the prime version is its own family", familyKey(other[1]!) !== familyKey(other[2]!))
check("the family lists the versions that make things, not the one that edits", familyOf(rep[0]!, pool).map((r) => r.endpoint).sort().join() === "wan-video/wan-2.7-i2v,wan-video/wan-2.7-r2v,wan-video/wan-2.7-t2v", familyOf(rep[0]!, pool).map((r) => r.endpoint).join())
check("an editing tool describes only itself", familyOf(rep[3]!, pool).length === 1 && familyOf(rep[3]!, pool)[0]!.id === rep[3]!.id)
check("an image model of the same name is not in a video family", !familyOf(rep[0]!, pool).some((r) => r.modality === "image"))
check("the sibling for reference images is found on Replicate", findSibling(rep[0]!, pool, "reference-to-video")?.endpoint === "wan-video/wan-2.7-r2v")
check("the sibling for a start frame is found on Replicate", findSibling(rep[0]!, pool, "image-to-video")?.endpoint === "wan-video/wan-2.7-i2v")

// fal names them by task in the path
const fal = ["text-to-video", "image-to-video", "reference-to-video"].map((t) => rec("fal", `alibaba/wan-3.0/${t}`, t === "text-to-video" ? "text-to-video" : "image-to-video"))
const falPrime = ["text-to-video", "image-to-video"].map((t) => rec("fal", `alibaba/wan-3.0-prime/${t}`, t))
const falPool = [...fal, ...falPrime]
check("fal's three versions are one family", new Set(fal.map(familyKey)).size === 1)
check("the prime version is another family on fal", familyKey(fal[0]!) !== familyKey(falPrime[0]!))
check("the same model on two providers is two families", familyKey(rec("fal", "alibaba/wan-3.0/text-to-video", "text-to-video")) !== familyKey(rec("replicate", "alibaba/wan-3.0/text-to-video", "text-to-video")))
check("fal's sibling for reference images is found", findSibling(fal[0]!, falPool, "reference-to-video")?.endpoint === "alibaba/wan-3.0/reference-to-video")

// What the family takes together
const summary = (refs: object) => ({ refs: { images: 0, start: false, end: false, videos: 0, audios: 0, elements: false, stated: true, ...refs } })
const t2v = { ...fal[0]!, summary: undefined }
const i2v = { ...fal[1]!, summary: summary({ start: true, end: true }) } as ModelRecord
const r2v = { ...fal[2]!, summary: summary({ images: 10, videos: 5, audios: 5 }) } as ModelRecord
const merged = mergeRefs([t2v as ModelRecord, i2v, r2v])
check("the family takes the most any version takes", merged?.images === 10 && merged?.videos === 5 && merged?.audios === 5 && merged?.start === true && merged?.end === true)
const chips = rowChips(t2v as ModelRecord, [t2v as ModelRecord, i2v, r2v])
check("a text-to-video row shows what its family can do", chips.includes("Start/End") && chips.includes("10 refs") && chips.includes("Video refs") && chips.includes("Audio refs"), chips.join())
check("a lone version shows only its own", !rowChips(t2v as ModelRecord).includes("Start/End"))

// The real Wan 3.0 data shipped with the app
const snap = JSON.parse(readFileSync(new URL("../src/lib/registry/registry.snapshot.json", import.meta.url), "utf8")) as { models: ModelRecord[] }
const wan = snap.models.find((m) => m.id === "fal/alibaba/wan-3.0/text-to-video")!
const wanChips = rowChips(wan, familyOf(wan, snap.models))
check("real Wan 3.0 on fal: start and end frame, reference images, video and audio references, seed", ["Start/End", "Video refs", "Audio refs", "Seed"].every((c) => wanChips.includes(c)) && wanChips.some((c) => /refs?$/.test(c) && /^\d+/.test(c)), wanChips.join())
check("real Wan 3.0 prime stays separate", !familyOf(wan, snap.models).some((m) => /prime/.test(m.endpoint)))

console.log(fails ? `${fails} FAILED` : "ALL PASS")
process.exit(fails ? 1 : 0)
