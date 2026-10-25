import { LOOK_ALIKE_WITHIN, differences, findDuplicate, lookOf } from "../src/lib/library/fingerprint"
import type { KnownFile, Print } from "../src/lib/library/fingerprint"
import { applyFilters, inDateRange, madeAtOf } from "../src/lib/library/filters"
import type { Filterable } from "../src/lib/library/filters"

/** Telling a file you already have (same file, same name and size, look-alike picture), and the header's filters. */

let fails = 0
const check = (name: string, ok: boolean, extra: unknown = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : JSON.stringify(extra)}`)
  if (!ok) fails++
}

// the look of a picture: 9 by 8 grey squares, each compared with its right neighbour
const grey = (f: (row: number, col: number) => number) => Array.from({ length: 72 }, (_, i) => f(Math.floor(i / 9), i % 9))
const gradient = grey((_, c) => c * 20) // brighter to the right
const reverse = grey((_, c) => (8 - c) * 20) // darker to the right
const flat = grey(() => 100)
check("a look is 16 letters", lookOf(gradient).length === 16)
check("a picture that gets darker to the right marks every square, one that gets brighter marks none", lookOf(reverse) === "ffffffffffffffff" && lookOf(gradient) === "0000000000000000")
check("a flat picture marks nothing", lookOf(flat) === "0000000000000000")
check("two looks that are the same differ in no marks, opposite ones in all 64", differences(lookOf(gradient), lookOf(gradient)) === 0 && differences(lookOf(gradient), lookOf(reverse)) === 64)
check("a brighter or darker copy of a picture keeps the same look (only differences between squares matter)", lookOf(grey((r, c) => c * 20 + 30)) === lookOf(gradient) && lookOf(grey((r, c) => (c * 20) / 2)) === lookOf(gradient))
const noisy = grey((r, c) => c * 20 + (r === 3 && c === 2 ? -45 : 0)) // one square off: one or two marks differ
check("a resized or recompressed copy differs in only a few marks", differences(lookOf(noisy), lookOf(gradient)) >= 1 && differences(lookOf(noisy), lookOf(gradient)) <= LOOK_ALIKE_WITHIN, differences(lookOf(noisy), lookOf(gradient)))
check("looks of different lengths are not alike", differences("ab", "abcd") === 64)
check("a look needs 72 squares", (() => { try { lookOf([1, 2, 3]); return false } catch { return true } })())

// the three ways a file can be one you already have
const known = (over: Partial<KnownFile> = {}): KnownFile => ({ id: "k1", projectId: "p1", title: "sunset", type: "image", bytes: 1000, hash: "H1", look: lookOf(gradient), ...over })
const file = (over: { title?: string; hash?: string; look?: string; bytes?: number; projectId?: string; type?: string } = {}) => ({ projectId: over.projectId ?? "p1", title: over.title ?? "new", type: over.type ?? "image", print: { hash: over.hash ?? "NEW", look: over.look, bytes: over.bytes ?? 5 } as Print })
check("the same bytes are the same file, under any name", findDuplicate(file({ hash: "H1", title: "copy of sunset (2)" }), [known()])?.kind === "same")
check("the same name and size, with different bytes, is probably the same file saved again", findDuplicate(file({ title: "Sunset", bytes: 1000 }), [known()])?.kind === "named")
check("a picture that looks the same is a look-alike", findDuplicate(file({ look: lookOf(noisy) }), [known()])?.kind === "similar")
check("a picture that looks different is new", findDuplicate(file({ look: lookOf(reverse) }), [known()]) === undefined)
check("the same file wins over a look-alike", findDuplicate(file({ hash: "H1", look: lookOf(noisy) }), [known()])?.kind === "same")
check("the answer says which one it is", findDuplicate(file({ hash: "H1" }), [known({ id: "a", hash: "X" }), known({ id: "b" })])?.of === "b")
check("another project's file does not count", findDuplicate(file({ hash: "H1" }), [known({ projectId: "p2" })]) === undefined)
check("a clip is not compared with a picture", findDuplicate(file({ hash: "H1", type: "video" }), [known()]) === undefined)
check("a file with no fingerprint yet (saved before) is not matched by hash", findDuplicate(file({ hash: "H1" }), [known({ hash: undefined, look: undefined, title: "other" })]) === undefined)

// the filters
const at = (days: number, now: number) => now - days * 24 * 3600 * 1000
const NOW = Date.parse("2026-10-15T15:00:00Z")
check("a result's time is read from its id", madeAtOf("image-asset-1792010000000") === 1792010000000 && madeAtOf("agent-image-1792010000000-0") === 1792010000000 && madeAtOf("upload-1792010000000-abcde") === 1792010000000)
check("an id with no time has none", madeAtOf("abc") === undefined && madeAtOf("run-12") === undefined)
check("today is since this morning", inDateRange(NOW - 3600_000, "today", NOW) === true && inDateRange(at(2, NOW), "today", NOW) === false)
check("seven days and thirty days count back from now", inDateRange(at(6, NOW), "7days", NOW) && !inDateRange(at(8, NOW), "7days", NOW) && inDateRange(at(29, NOW), "30days", NOW) && !inDateRange(at(31, NOW), "30days", NOW))
check("all keeps everything, and so does a result whose time cannot be told", inDateRange(at(400, NOW), "all", NOW) && inDateRange(undefined, "today", NOW))

const item = (id: string, over: Partial<Filterable> = {}): Filterable => ({ id, title: id, prompt: "a red car", model: "Flux Pro", status: "completed", type: "image", activity: "generated", ...over })
const state = { liked: new Set(["b"]), downloaded: new Set(["c"]) }
const items = [item("image-1792010000000"), item("b", { model: "Seedream" }), item("c", { status: "failed" }), item("d", { activity: "uploaded", prompt: "a blue boat" })]
const ids = (f: Parameters<typeof applyFilters>[1]) => applyFilters(items, f, state, NOW).map((i) => i.id).join()
check("no filters keeps everything", ids({}) === "image-1792010000000,b,c,d")
check("model filters by name", ids({ model: "seedream" }) === "b")
check("status filters by whether it worked", ids({ status: "failed" }) === "c" && ids({ status: "completed" }) === "image-1792010000000,b,d")
check("hide failed hides them", ids({ hideFailed: true }) === "image-1792010000000,b,d")
check("Liked finds what has a heart", ids({ activity: "liked" }) === "b")
check("Downloaded finds what was downloaded", ids({ activity: "downloaded" }) === "c")
check("Generated and Uploaded split by where it came from", ids({ activity: "uploaded" }) === "d" && ids({ activity: "generated" }) === "image-1792010000000,b,c")
check("search looks in the title, the prompt and the model", ids({ search: "boat" }) === "d" && ids({ search: "seedream" }) === "b" && ids({ search: "RED CAR" }) === "image-1792010000000,b,c")
check("type filters by kind", applyFilters([...items, item("v", { type: "video" })], { type: "video" }, state, NOW).map((i) => i.id).join() === "v")
check("filters combine", ids({ model: "flux", hideFailed: true, activity: "generated" }) === "image-1792010000000")

console.log(fails === 0 ? "all passed" : `${fails} failed`)
process.exit(fails === 0 ? 0 : 1)
