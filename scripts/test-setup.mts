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
const { hasPassword, checkPassword, isPinLock, setPin, setPassword, removePassword } = await import("../src/lib/auth/lock.ts")
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
  assert.ok(isPin("123456") && !isPin("1234") && !isPin("12345") && !isPin("1234567") && !isPin("12a456"))
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

await (async () => {
  storage.clear()
  try {
    assert.equal(hasPassword(), false)
    assert.equal(await setPin("12345"), "not-a-pin")
    assert.equal(await setPin("1234567"), "not-a-pin")
    assert.equal(await setPin("123456"), "ok")
    assert.equal(isPinLock(), true)
    assert.equal(await checkPassword("123456"), true)
    assert.equal(await checkPassword("654321"), false)
    assert.equal(await setPin("111111", "000000"), "wrong-current")
    assert.equal(await setPin("111111", "123456"), "ok")
    assert.equal(await removePassword("111111"), true)
    assert.equal(hasPassword(), false)
    assert.equal(await setPassword("a long password"), "ok")
    assert.equal(isPinLock(), false)
    passed++
    console.log("PASS  the lock: a 6-digit PIN is stored as a PIN, a wrong current PIN is refused, and an old text password is not a PIN")
  } catch (e) {
    console.log(`FAIL  the lock
      ${e instanceof Error ? e.message : e}`)
    process.exitCode = 1
  }
})()

console.log(`
${passed} passed`)
console.log(process.exitCode ? "some failed" : "all passed")
