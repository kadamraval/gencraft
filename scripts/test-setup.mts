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

const { isCode, isEmail, isPassword, isPin } = await import("../src/lib/account/validate.ts")
const { clearSession, readSession, writeSession } = await import("../src/lib/account/session.ts")
const { readSetup, writeSetup, resetSetup, shouldShowSetup, SETUP_STEPS } = await import("../src/lib/home/onboarding.ts")

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
  writeSetup({ step: "setup", plan: "paid" })
  storage.setItem("gencraft_studio_settings", "{}")
  assert.equal(shouldShowSetup(), true)
  assert.equal(readSetup().step, "setup")
  assert.equal(readSetup().plan, "paid")
})
check("a finished setup is not shown again, and Run setup again brings it back", () => {
  writeSetup({ done: true, step: "done" })
  assert.equal(shouldShowSetup(), false)
  resetSetup()
  assert.equal(shouldShowSetup(), true)
  assert.equal(readSetup().step, "account")
})
check("the setup is short: sign up, a PIN, pricing, one setup screen, done", () => {
  assert.deepEqual(SETUP_STEPS, ["account", "pin", "plan", "setup", "done"])
  assert.equal(readSetup().step, "account")
})

check("sign-up checks: email, password, code and PIN", () => {
  assert.ok(isEmail("a@b.co") && !isEmail("a@b") && !isEmail("a b@c.de") && !isEmail(""))
  assert.ok(isPassword("12345678") && !isPassword("1234567"))
  assert.ok(isCode("123456") && isCode(" 123456 ") && !isCode("12345") && !isCode("12345a"))
  assert.ok(isPin("1234") && isPin("123456") && !isPin("123") && !isPin("1234567") && !isPin("12a4"))
})
check("the signed-in session is kept on the device, for a guest too, and can be cleared", () => {
  assert.equal(readSession(), null)
  writeSession({ guest: true })
  assert.equal(readSession()?.guest, true)
  writeSession({ email: "a@b.co", guest: false })
  assert.equal(readSession()?.email, "a@b.co")
  clearSession()
  assert.equal(readSession(), null)
})

console.log(`
${passed} passed`)
console.log(process.exitCode ? "some failed" : "all passed")
