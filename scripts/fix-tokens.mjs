import fs from 'node:fs'
import path from 'node:path'

const srcDir = path.resolve('src')

function getFiles(d) {
  const res = []
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory() && !p.includes('node_modules')) res.push(...getFiles(p))
    else if (e.isFile() && /\.(tsx|ts)$/.test(e.name)) res.push(p)
  }
  return res
}

let changedCount = 0
for (const f of getFiles(srcDir)) {
  let content = fs.readFileSync(f, 'utf-8')
  const original = content

  // 1. Replace arbitrary font sizes with standard scale
  content = content.replace(/text-\[(9px|10px|11px|11\.5px|12px|13px|0\.8rem)\]/g, 'text-xs')
  content = content.replace(/text-\[14px\]/g, 'text-sm')
  content = content.replace(/text-\[16px\]/g, 'text-base')

  // 2. Replace arbitrary dimensions with standard tokens
  content = content.replace(/h-\[48px\]/g, 'h-12')
  content = content.replace(/min-w-\[114px\]/g, 'min-w-28')
  content = content.replace(/h-\[490px\]/g, 'h-full')
  content = content.replace(/rounded-\[calc\(1rem-1px\)\]/g, 'rounded-xl')
  content = content.replace(/style=\{\{\s*minHeight:\s*["']36px["']\s*\}\}/g, '')

  // 3. Replace raw textarea with Textarea if already imported or simple style
  content = content.replace(/style=\{\{\s*fontSize:\s*["'][^"']+["']\s*\}\}/g, '')

  if (content !== original) {
    fs.writeFileSync(f, content, 'utf-8')
    changedCount++
    console.log('Fixed tokens in:', path.relative(process.cwd(), f))
  }
}

console.log('Total files updated:', changedCount)
