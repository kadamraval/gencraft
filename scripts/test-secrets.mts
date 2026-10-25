// The secret scanner finds keys and key files and leaves ordinary code alone.
import { forbiddenName, scanText } from "./check-secrets.mjs"

let failed = 0
const t = (name: string, ok: boolean) => {
  if (!ok) failed++
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`)
}

// Strings are built from pieces so this file itself holds no complete key-like text
const google = "AI" + "za" + "A".repeat(35)
const openai = "s" + "k-" + "a1B2".repeat(8)
const replicate = "r" + "8_" + "a1B2c3".repeat(6)
const fal = "12345678-1234-1234-1234-123456789abc:" + "0123456789abcdef".repeat(2)
const ghp = "gh" + "p_" + "a1B2c3".repeat(7)
const pem = "-----BEGIN " + "PRIVATE KEY-----"
const jwk = '{"kty":"EC","d":"' + "A".repeat(43) + '"}'
const tauri = "dW50cnVzdGVkIGNvbW1lbnQ6IHNlY3JldCBrZXk" + "6"

for (const [name, text] of Object.entries({ google, openai, replicate, fal, ghp, pem, jwk, tauri })) {
  t(`finds ${name}`, scanText("src/x.ts", `const k = "${text}"`).length === 1)
}
t("reports the line, not the value", (() => {
  const r = scanText("src/x.ts", `a\nconst k = "${google}"`)
  return r.length === 1 && r[0].startsWith("src/x.ts:2") && !r[0].includes(google)
})())
t("leaves ordinary code alone", scanText("src/x.ts", "const task = 'sk-short'\nconst id = '12345678-1234-1234-1234-123456789abc'\nconst d = { d: 5 }").length === 0)
t("public updater key is fine", scanText("src-tauri/tauri.conf.json", '"pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEI5ODlBNzA"').length === 0)
t("test files may hold look-alike keys", scanText("scripts/test-x.mts", `const k = "${google}"`).length === 0)

t("env file is forbidden", forbiddenName(".env") !== null && forbiddenName("app/.env.production") !== null && forbiddenName(".env.local") !== null)
t(".env.example is allowed", forbiddenName(".env.example") === null)
t("key files are forbidden", forbiddenName("a/b/id.pem") !== null && forbiddenName("x.key") !== null && forbiddenName("packs.jwk.json") !== null)
t("signing folder is forbidden", forbiddenName(".license/packs-private.jwk.json") !== null)
t("app backups are forbidden", forbiddenName("my.gencraftbackup") !== null && forbiddenName("old.t18backup") !== null)
t("normal files are fine", forbiddenName("src/App.tsx") === null && forbiddenName("README.md") === null && forbiddenName("keyboard.ts") === null)

if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}
