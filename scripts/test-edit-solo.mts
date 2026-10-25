import assert from "node:assert/strict"
import { isOff, setTrack, swapLayers } from "../src/components/story/edit-model.ts"

let p: any = { clips: [], captions: [], audio: [] }
assert.equal(isOff(p, "v1"), false)
p = setTrack(p, "v2", { solo: true })
assert.equal(isOff(p, "v1"), true, "other picture layers go off")
assert.equal(isOff(p, "v2"), false)
assert.equal(isOff(p, "a1"), false, "audio lanes are not affected by a picture solo")
assert.equal(isOff(p, "captions"), false)
p = setTrack(p, "a1", { mute: true })
assert.equal(isOff(p, "a1"), true)
p = setTrack(p, "v2", { solo: false })
assert.equal(isOff(p, "v1"), false)
assert.deepEqual(Object.keys(p.tracks), ["a1"])

// Reordering layers: overlays, lanes, and their mute/height go with them
let q: any = {
  clips: [],
  captions: [],
  overlays: [{ id: "o2", shotId: "", take: 0, layer: 2, start: 0, duration: 1, trimIn: 0 }, { id: "o3", shotId: "", take: 0, layer: 3, start: 0, duration: 1, trimIn: 0 }],
  audio: [{ id: "x1", uploadId: "u", name: "a", start: 0, duration: 1, volume: 1, lane: 1 }, { id: "x2", uploadId: "u", name: "b", start: 0, duration: 1, volume: 1, lane: 2 }],
  tracks: { v2: { mute: true }, a2: { lock: true } },
  heights: { v3: 90 },
}
const v = swapLayers(q, "video", 2, 3)
assert.deepEqual(v.overlays.map((o: any) => [o.id, o.layer]), [["o2", 3], ["o3", 2]])
assert.deepEqual(v.tracks.v3, { mute: true })
assert.equal(v.tracks.v2, undefined)
assert.equal(v.heights.v2, 90)
assert.equal(swapLayers(q, "video", 1, 2), q, "V1 stays")
const a = swapLayers(q, "audio", 1, 2)
assert.deepEqual(a.audio.map((x: any) => [x.id, x.lane]), [["x1", 2], ["x2", 1]])
assert.deepEqual(a.tracks.a1, { lock: true })
console.log("solo and layer order: all passed")
