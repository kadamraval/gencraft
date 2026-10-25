/**
 * Draws the installer pictures from the HTML and SVG sources in src-tauri/installer/:
 *
 *   npm i --no-save playwright-core pngjs
 *   node scripts/build-installer-art.mjs
 *
 * Writes src-tauri/installer/sidebar.bmp (164x314) and header.bmp (150x57) for the Windows installer (it only reads BMP), dmg-background.png (660x400)
 * for the macOS disk image, and icon-source.png (1024x1024) which `npx tauri icon src-tauri/installer/icon-source.png` turns into every app icon.
 * Needs Chrome (set CHROME_PATH if it is not in the usual place). The results are committed, so this only runs when the art changes.
 */
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { chromium } from "playwright-core"
import { PNG } from "pngjs"

const dir = path.resolve("src-tauri/installer")
const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe"

/** A 24-bit BMP, which is what the NSIS installer reads for its side and header pictures */
function toBmp(png) {
  const { width, height, data } = png
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const out = Buffer.alloc(54 + rowSize * height)
  out.write("BM", 0)
  out.writeUInt32LE(out.length, 2)
  out.writeUInt32LE(54, 10)
  out.writeUInt32LE(40, 14)
  out.writeInt32LE(width, 18)
  out.writeInt32LE(height, 22)
  out.writeUInt16LE(1, 26)
  out.writeUInt16LE(24, 28)
  out.writeUInt32LE(rowSize * height, 34)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = ((height - 1 - y) * width + x) * 4
      const dst = 54 + y * rowSize + x * 3
      out[dst] = data[src + 2]
      out[dst + 1] = data[src + 1]
      out[dst + 2] = data[src]
    }
  }
  return out
}

const browser = await chromium.launch({ executablePath: chrome, headless: true })
async function render(file, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.goto(pathToFileURL(path.join(dir, file)).href)
  const png = await page.screenshot({ type: "png" })
  await page.close()
  return png
}

fs.writeFileSync(path.join(dir, "sidebar.bmp"), toBmp(PNG.sync.read(await render("sidebar.html", 164, 314))))
fs.writeFileSync(path.join(dir, "header.bmp"), toBmp(PNG.sync.read(await render("header.html", 150, 57))))
fs.writeFileSync(path.join(dir, "dmg-background.png"), await render("dmg.html", 660, 400))

// The app icon: the mark on a transparent square
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(path.join(dir, "mark.svg")).href)
fs.writeFileSync(path.join(dir, "icon-source.png"), await page.screenshot({ type: "png", omitBackground: true }))
await browser.close()
console.log("installer art written to", dir)
