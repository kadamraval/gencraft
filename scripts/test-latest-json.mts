// make-latest-json joins the three systems into release files and the small update files the website serves.
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

let failed = 0
const t = (name: string, ok: boolean) => {
  if (!ok) failed++
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`)
}

const version = (JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8")) as { version: string }).version
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gc-latest-"))
const parts = path.join(tmp, "parts")
const out = path.join(tmp, "out")
const part = (name: string, osName: string, update: string, platforms: string[], downloads: string[]) => {
  const dir = path.join(parts, `installer-${name}`)
  fs.mkdirSync(dir, { recursive: true })
  for (const f of new Set([update, ...downloads])) fs.writeFileSync(path.join(dir, f), `${name}:${f}`)
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ os: osName, update, signature: `sig-${name}`, platforms, downloads: [update, ...downloads.filter((d) => d !== update)] }))
}
part("windows", "windows", `Gencraft_${version}_x64-setup.exe`, ["windows-x86_64"], [])
part("macos", "macos", "Gencraft.app.tar.gz", ["darwin-aarch64", "darwin-x86_64"], [`Gencraft_${version}_universal.dmg`])
part("linux", "linux", `Gencraft_${version}_amd64.AppImage`, ["linux-x86_64"], [`Gencraft_${version}_amd64.deb`])

execFileSync("npx", ["tsx", "scripts/make-latest-json.mts", out, parts], { stdio: "pipe", shell: true })
const latest = JSON.parse(fs.readFileSync(path.join(out, "pages", "latest.json"), "utf8"))
const downloads = JSON.parse(fs.readFileSync(path.join(out, "pages", "downloads.json"), "utf8"))
const assets = fs.readdirSync(path.join(out, "assets"))

t("latest.json has the version of the app", latest.version === version)
t("latest.json lists every platform with its signature", Object.keys(latest.platforms).sort().join() === "darwin-aarch64,darwin-x86_64,linux-x86_64,windows-x86_64" && latest.platforms["windows-x86_64"].signature === "sig-windows")
t("update urls point at the release files, not the website", Object.values(latest.platforms).every((p) => (p as { url: string }).url.startsWith(`https://github.com/kadamraval/gencraft/releases/download/v${version}/`)))
t("installers and SHA256SUMS are release files", assets.includes("SHA256SUMS") && assets.includes(`Gencraft_${version}_universal.dmg`) && assets.includes(`Gencraft_${version}_amd64.deb`))
t("the website gets only small files", fs.readdirSync(path.join(out, "pages")).sort().join() === "SHA256SUMS,downloads.json,latest.json")
t("downloads.json marks a beta", downloads.beta === /-(alpha|beta|rc)/i.test(version) && downloads.files.length === assets.length - 1)
const sums = fs.readFileSync(path.join(out, "assets", "SHA256SUMS"), "utf8").trim().split("\n")
t("SHA256SUMS has one line per file", sums.length === downloads.files.length && sums.every((l) => /^[0-9a-f]{64} {2}\S+$/.test(l)))

fs.rmSync(tmp, { recursive: true, force: true })
if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}
