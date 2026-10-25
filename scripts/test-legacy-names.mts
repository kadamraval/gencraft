import assert from "node:assert/strict"
import { LEGACY_LOCK_KEYS, migrateLocalStorage } from "../src/lib/legacy-names.ts"

let passed = 0
const check = (name: string, fn: () => void) => {
  try {
    fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (e) {
    console.log(`FAIL  ${name}
      ${e instanceof Error ? e.message : e}`)
    process.exitCode = 1
  }
}

class MemoryStorage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null
  }
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
  keys() {
    return [...this.data.keys()].sort()
  }
}

check("old t18_ and t20_ keys move to the new names, with their values", () => {
  const s = new MemoryStorage()
  s.setItem("t18_stories_v1", "[1]")
  s.setItem("t18_tool_model_video-upscale", "fal/x")
  s.setItem("t20_studio_settings", "{}")
  assert.equal(migrateLocalStorage(s), 3)
  assert.deepEqual(s.keys(), ["gencraft_stories_v1", "gencraft_studio_settings", "gencraft_tool_model_video-upscale"])
  assert.equal(s.getItem("gencraft_stories_v1"), "[1]")
})

check("a value already under the new name is kept, and the old one is removed", () => {
  const s = new MemoryStorage()
  s.setItem("t18_lock_v1", "old")
  s.setItem("gencraft_lock_v1", "new")
  migrateLocalStorage(s)
  assert.equal(s.getItem("gencraft_lock_v1"), "new")
  assert.equal(s.getItem("t18_lock_v1"), null)
})

check("the old plain-text password keys are left for the lock to read and remove", () => {
  const s = new MemoryStorage()
  for (const k of Object.values(LEGACY_LOCK_KEYS)) s.setItem(k, "x")
  s.setItem("unrelated", "y")
  assert.equal(migrateLocalStorage(s), 0)
  assert.equal(s.length, 4)
})

check("running it twice changes nothing the second time", () => {
  const s = new MemoryStorage()
  s.setItem("t18_apps_v1", "{}")
  migrateLocalStorage(s)
  assert.equal(migrateLocalStorage(s), 0)
  assert.deepEqual(s.keys(), ["gencraft_apps_v1"])
})

console.log(`
${passed} passed`)
console.log(process.exitCode ? "some failed" : "all passed")
