import assert from "node:assert/strict"
import { clipStarts, clipsAt, deleteClip, duplicateClip, moveClip, overlapOf, rippleDeleteClip, setTransitionIn, splitClip, totalLength } from "../src/components/story/edit-model.ts"

const clip = (id: string, duration: number, extra: object = {}) => ({ id, shotId: "s" + id, take: 0, duration, trimIn: 0, ...extra })
const base = (clips: any[]): any => ({ clips, captions: [], audio: [] })

let p = base([clip("a", 4), clip("b", 4), clip("c", 4)])
assert.deepEqual(clipStarts(p.clips), [0, 4, 8])
assert.equal(totalLength(p), 12)

p = setTransitionIn(p, "b", { id: "dissolve", duration: 1 })
assert.deepEqual(clipStarts(p.clips), [0, 3, 7], "b starts a second early")
assert.equal(totalLength(p), 11, "the cut is a second shorter")
assert.equal(overlapOf(p.clips, 1), 1)
assert.equal(setTransitionIn(p, "a", { id: "x", duration: 1 }), p, "the first clip has nothing before it")

// at a time inside the overlap two clips show, with progress
let at = clipsAt(p, 3.5)
assert.deepEqual(at.clips.map((c) => c.index), [0, 1])
assert.equal(at.progress, 0.5)
at = clipsAt(p, 2)
assert.deepEqual(at.clips.map((c) => c.index), [0])
assert.equal(at.progress, null)
at = clipsAt(p, 4.5)
assert.deepEqual(at.clips.map((c) => c.index), [1])

// the overlap never takes more than a clip can give
const tiny = setTransitionIn(base([clip("a", 0.5), clip("b", 0.5)]), "b", { id: "x", duration: 5 })
assert.ok(overlapOf(tiny.clips, 1) <= 0.3)
assert.ok(clipStarts(tiny.clips)[1]! >= 0.2)

// split: the transition stays with the first half only
const split = splitClip(p, "b", 5)
assert.ok(split.clips[1]!.transitionIn)
assert.equal(split.clips[2]!.transitionIn, undefined)

// duplicate: the copy does not transition into its original
const dup = duplicateClip(p, "b")
assert.equal(dup.clips[2]!.transitionIn, undefined)

// delete or reorder drops a transition whose neighbours changed
assert.equal(deleteClip(p, "a").clips[0]!.transitionIn, undefined)
const kept = moveClip(p, "c", 0)
assert.ok(kept.clips[2]!.transitionIn, "a and b are still neighbours, so b keeps its transition")
const moved = moveClip(p, "b", 2)
assert.ok(moved.clips.every((c: any) => c.transitionIn === undefined), "b has new neighbours, so its transition went")

// ripple delete moves what follows by what the next clip really moves
let q: any = setTransitionIn(base([clip("a", 4), clip("b", 4), clip("c", 4)]), "c", { id: "x", duration: 1 })
q = { ...q, captions: [{ id: "t", text: "x", start: 10, duration: 1 }] }
assert.deepEqual(clipStarts(q.clips), [0, 4, 7])
const r = rippleDeleteClip(q, "b")
assert.equal(r.clips[1]!.transitionIn, undefined, "c lost its neighbour, so its transition went")
assert.deepEqual(clipStarts(r.clips), [0, 4])
assert.equal(r.captions[0]!.start, 7, "c moved from 7 to 4, so the caption in it moved 3 earlier")
console.log("transitions: all passed")
