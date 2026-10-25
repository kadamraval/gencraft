// Refuses anything that looks like a key, token or secret file. One scanner, four places:
//   node scripts/check-secrets.mjs --staged            files about to be committed (pre-commit hook)
//   node scripts/check-secrets.mjs --range <a> <b>     what a push would add, commits a..b (pre-push hook)
//   node scripts/check-secrets.mjs --git               every file git tracks (CI)
//   node scripts/check-secrets.mjs --dir <folder>      every file in a folder (the public snapshot)
// A finding prints the file, the line and the kind of secret, never the secret itself. Exit code 1 when anything is found.
import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/** What a secret looks like. */
export const PATTERNS = [
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["OpenAI or Anthropic key", /\bsk-[A-Za-z0-9_-]{24,}/],
  ["Replicate token", /\br8_[A-Za-z0-9]{30,}/],
  ["fal key", /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{32}\b/],
  ["GitHub token", /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/],
  ["GitHub fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{50,}/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Private key block", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ["Signing key (JWK private part)", /"d"\s*:\s*"[A-Za-z0-9_-]{30,}"/],
  ["Tauri updater private key", /dW50cnVzdGVkIGNvbW1lbnQ6IHNlY3JldCBrZXk/],
]

/** Files that must never be committed, whatever they contain. */
export function forbiddenName(file) {
  const p = file.replace(/\\/g, "/")
  const base = p.split("/").pop() ?? p
  if (p.startsWith(".license/") || p.includes("/.license/")) return "a signing key folder"
  if (base === ".env.example") return null
  if (base === ".env" || base.startsWith(".env.")) return "an environment file"
  if (/\.(pem|key|p12|pfx)$/i.test(base)) return "a key file"
  if (/\.jwk\.json$/i.test(base) || /\.keys\.json$/i.test(base)) return "a key file"
  if (/\.(gencraftbackup|t18backup)$/i.test(base)) return "an app backup (it holds personal files and settings)"
  return null
}

/** Test files hold strings that only look like keys. */
function allowed(file) {
  const p = file.replace(/\\/g, "/")
  return /^scripts\/(pro\/)?test-[^/]*\.mts$/.test(p) || p === ".env.example" || p === "scripts/check-secrets.mjs" || p === ".gitleaks.toml"
}

export function scanText(file, text) {
  const out = []
  if (allowed(file)) return out
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.length > 20000) continue
    for (const [kind, re] of PATTERNS) if (re.test(line)) out.push(`${file}:${i + 1}  ${kind}`)
  }
  return out
}

function isText(buf) {
  return !buf.subarray(0, 8000).includes(0)
}

function scanFileContent(file, buf) {
  if (buf.length > 2_000_000 || !isText(buf)) return []
  return scanText(file, buf.toString("utf8"))
}

const git = (...args) => execFileSync("git", args, { encoding: "buffer", maxBuffer: 1 << 28 })
const gitText = (...args) => git(...args).toString("utf8")

function walk(dir, base = dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, base, acc)
    else acc.push(path.relative(base, full).replace(/\\/g, "/"))
  }
  return acc
}

function main(argv) {
  const mode = argv[0]
  const findings = []
  const check = (file, getBuf) => {
    const why = forbiddenName(file)
    if (why) findings.push(`${file}  ${why}`)
    else {
      let buf
      try {
        buf = getBuf()
      } catch {
        return
      }
      findings.push(...scanFileContent(file, buf))
    }
  }
  if (mode === "--staged") {
    const files = gitText("diff", "--cached", "--name-only", "--diff-filter=ACM", "-z").split("\0").filter(Boolean)
    for (const f of files) check(f, () => git("show", `:${f}`))
  } else if (mode === "--range") {
    const [a, b] = [argv[1], argv[2]]
    const empty = /^0+$/.test(a ?? "")
    const range = empty ? b : `${a}..${b}`
    const files = gitText("diff", "--name-only", "--diff-filter=ACM", "-z", ...(empty ? [`${b}`, "--not", "--remotes"] : [range])).split("\0").filter(Boolean)
    for (const f of files) check(f, () => git("show", `${b}:${f}`))
  } else if (mode === "--git") {
    const files = gitText("ls-files", "-z").split("\0").filter(Boolean)
    for (const f of files) check(f, () => readFileSync(f))
  } else if (mode === "--dir") {
    const dir = argv[1]
    if (!dir) throw new Error("Usage: check-secrets.mjs --dir <folder>")
    for (const f of walk(dir)) check(f, () => readFileSync(path.join(dir, f)))
  } else {
    console.error("Usage: check-secrets.mjs --staged | --range <a> <b> | --git | --dir <folder>")
    process.exit(2)
  }
  if (findings.length) {
    console.error("A secret or a secret file was found. Nothing was committed or published:")
    for (const f of findings.slice(0, 40)) console.error("  " + f)
    console.error("Keep keys in .env.local (git-ignored) or in the app's Settings, never in a tracked file.")
    process.exit(1)
  }
  console.log("No secrets found.")
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main(process.argv.slice(2))
