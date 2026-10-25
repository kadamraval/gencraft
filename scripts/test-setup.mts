import assert from "node:assert/strict"

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
  clear() {
    this.data.clear()
  }
}
const storage = new MemoryStorage()
;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = storage

const { readSetup, writeSetup, resetSetup, shouldShowSetup, stepsFor } = await import("../src/lib/home/onboarding.ts")

let passed = 0
const check = (name: string, fn: () => void) => {
  try {
    storage.clear()
    fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (e) {
    console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : e}`)
    process.exitCode = 1
  }
}

check("a new install shows the setup", () => assert.equal(shouldShowSetup(), true))
check("a device with settings from an earlier version does not", () => {
  storage.setItem("gencraft_studio_settings", "{}")
  assert.equal(shouldShowSetup(), false)
})
check("a device with an app lock does not", () => {
  storage.setItem("gencraft_lock_v1", "{}")
  assert.equal(shouldShowSetup(), false)
})
check("a setup in progress is shown again until it is finished, even after settings were saved", () => {
  writeSetup({ step: "keys", plan: "paid" })
  storage.setItem("gencraft_studio_settings", "{}")
  assert.equal(shouldShowSetup(), true)
  assert.equal(readSetup().step, "keys")
  assert.equal(readSetup().plan, "paid")
})
check("a finished setup is not shown again, and Run setup again brings it back", () => {
  writeSetup({ done: true, step: "done" })
  assert.equal(shouldShowSetup(), false)
  resetSetup()
  assert.equal(shouldShowSetup(), true)
  assert.equal(readSetup().step, "plan")
})
check("Free skips the account step, Paid has it", () => {
  assert.ok(!stepsFor("free").includes("account"))
  assert.ok(stepsFor("paid").includes("account"))
  assert.equal(stepsFor("free")[0], "plan")
  assert.equal(stepsFor("paid").at(-1), "done")
})

console.log(`\n${passed} passed`)
console.log(process.exitCode ? "some failed" : "all passed")
