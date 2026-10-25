#!/usr/bin/env node

/**
 * Gencraft Design System Automated Quality Gate Audit
 * Strictly enforces design tokens, typography, ShadCN primitives,
 * color compliance, TypeScript safety, and console cleanliness.
 * Implements all specifications from design.md.
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const srcDir = path.join(rootDir, 'src')

// Explicit Allowlisted Files for specific functional requirements
const ALLOWLIST_SVG = ['brand-logos.tsx', 'onboarding-art.tsx']
const ALLOWLIST_DATA_VIS = [
  'usage-store.ts',
  'usage-history-view.tsx',
  'media-detail-modal.tsx',
  'App.tsx',
  'brand-studio-view.tsx',
  'story-view.tsx',
  'model-rates-view.tsx',
]
const ALLOWLIST_RAW_INPUTS = [
  'media-reference-modal.tsx', // hidden file input for native OS file selection
  'media-detail-modal.tsx',    // native range sliders for real-time webgl relighting
  'coming-module-view.tsx',    // native checkbox for watermark toggle
]

const violations = []

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // ai-elements is Vercel's AI Elements, kept as published; the rest of the app is held to this audit
      if (!['node_modules', 'dist', 'build', '.git', '.system_generated', 'ai-elements'].includes(entry.name)) {
        scanDir(fullPath)
      }
    } else if (entry.isFile() && /\.(tsx|ts)$/.test(entry.name)) {
      auditFile(fullPath)
    }
  }
}

function auditFile(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/')
  const fileName = path.basename(filePath)
  const isUiComponent = normalizedPath.includes('src/components/ui/')
  const isSvgAsset = ALLOWLIST_SVG.includes(fileName)
  const isDataVis = ALLOWLIST_DATA_VIS.includes(fileName)

  if (isUiComponent) {
    // UI primitives themselves define base styles, skip token checks on them
    return
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1
    const trimmed = lineText.trim()

    // Skip comment lines
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      return
    }

    // 1. RULE 1: NO ARBITRARY FONT SIZES
    const arbitraryFontMatch = lineText.match(/text-\[(\d+(\.\d+)?(px|rem))\]/)
    if (arbitraryFontMatch) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: 'NO_ARBITRARY_FONT_SIZE',
        found: arbitraryFontMatch[0],
        recommended: 'text-xs, text-sm, text-base, text-lg, text-xl, or text-2xl',
      })
    }

    // 2. RULE 2: TYPOGRAPHY ENFORCEMENT
    const arbitraryFontFamily = lineText.match(/font-\[(?!var\()[^\]]+\]/)
    if (arbitraryFontFamily) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: 'TYPOGRAPHY_ENFORCEMENT',
        found: arbitraryFontFamily[0],
        recommended: 'Standard typography tokens or project font configuration',
      })
    }
    if (lineText.includes('style={{') && lineText.includes('fontFamily') && !lineText.includes('// allow-font')) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: 'TYPOGRAPHY_ENFORCEMENT',
        found: 'inline fontFamily in style',
        recommended: 'Tailwind typography utility classes',
      })
    }

    // 3. RULE 3: NO ARBITRARY SPACING
    const arbitrarySpacingMatch = lineText.match(/(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space-x|space-y)-\[(\d+px)\]/)
    if (arbitrarySpacingMatch) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: 'NO_ARBITRARY_SPACING',
        found: arbitrarySpacingMatch[0],
        recommended: 'Standard Tailwind spacing tokens (e.g. p-2, p-3, gap-2, mt-4)',
      })
    }

    // 4. RULE 3: NO ARBITRARY DIMENSIONS
    const arbitraryDimMatch = lineText.match(/(w|h|min-w|max-w|min-h|max-h)-\[(\d+px)\]/)
    if (arbitraryDimMatch) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: 'NO_ARBITRARY_DIMENSIONS',
        found: arbitraryDimMatch[0],
        recommended: 'Standard Tailwind sizing tokens (e.g. h-8, h-10, h-12, w-full, max-w-xl)',
      })
    }

    // 5. RULE 3: NO ARBITRARY RADIUS
    const arbitraryRadiusMatch = lineText.match(/rounded-\[(\d+px)\]/)
    if (arbitraryRadiusMatch) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: 'NO_ARBITRARY_RADIUS',
        found: arbitraryRadiusMatch[0],
        recommended: 'rounded-sm, rounded-md, rounded-lg, rounded-xl, or rounded-2xl',
      })
    }

    // 6. RULE 3: NO ARBITRARY SHADOWS
    const arbitraryShadowMatch = lineText.match(/shadow-\[[^\]]+\]/)
    if (arbitraryShadowMatch) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: 'NO_ARBITRARY_SHADOW',
        found: arbitraryShadowMatch[0],
        recommended: 'shadow-xs, shadow-sm, shadow-md, shadow-lg, shadow-xl, or shadow-2xl',
      })
    }

    // 7. RULE 4: NO HARDCODED HEX COLORS IN TS/TSX
    if (!isSvgAsset && !isDataVis) {
      const hexMatch = lineText.match(/#[0-9a-fA-F]{3,8}\b/)
      if (hexMatch && !lineText.includes('// allow-color')) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: 'NO_HARDCODED_HEX_COLOR',
          found: hexMatch[0],
          recommended: 'semantic design token (e.g. bg-card, bg-popover, text-foreground, border-border)',
        })
      }

      // Hardcoded rgb/hsl functions in styles
      const colorFnMatch = lineText.match(/\b(rgba?|hsla?)\(\s*\d+/)
      if (colorFnMatch && !lineText.includes('// allow-color') && !lineText.includes('hsl(var(')) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: 'NO_HARDCODED_COLOR_FN',
          found: colorFnMatch[0],
          recommended: 'semantic design token (e.g. bg-background, text-foreground)',
        })
      }
    }

    // 8. RULE 5: NO INLINE STYLES FOR STATIC CSS
    if (lineText.includes('style={{') && !isSvgAsset && !isDataVis && !fileName.includes('dot-field')) {
      const isDynamic = lineText.includes('%') || lineText.includes('transform') || lineText.includes('width: `${')
      if (!isDynamic && (lineText.includes('fontSize') || lineText.includes('minHeight') || lineText.includes('color:') || lineText.includes('backgroundColor:'))) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: 'NO_INLINE_STYLES',
          found: trimmed,
          recommended: 'Tailwind utility classes or CSS variables',
        })
      }
    }

    // 9. RULE 6: NO COMPETING UI LIBRARIES
    if (/from\s+["'](@mui|antd|@chakra-ui|react-bootstrap|semantic-ui-react)/.test(lineText)) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: 'NO_COMPETING_UI_LIBRARY',
        found: trimmed,
        recommended: 'ShadCN UI component from @/components/ui/*',
      })
    }

    // 10. RULE 7: NO RAW HTML BUTTON / SELECT / TEXTAREA IN APP COMPONENTS
    if (!isSvgAsset) {
      if (/<button\b/.test(lineText)) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: 'RAW_HTML_BUTTON',
          found: '<button>',
          recommended: '<Button> from @/components/ui/button',
        })
      }
      if (/<textarea\b/.test(lineText)) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: 'RAW_HTML_TEXTAREA',
          found: '<textarea>',
          recommended: '<Textarea> from @/components/ui/textarea',
        })
      }
      if (/<select\b/.test(lineText)) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: 'RAW_HTML_SELECT',
          found: '<select>',
          recommended: '<Select> from @/components/ui/select',
        })
      }
      // Check for raw text input if not allowlisted
      if (/<input\b/.test(lineText) && !ALLOWLIST_RAW_INPUTS.includes(fileName)) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: 'RAW_HTML_INPUT',
          found: '<input>',
          recommended: '<Input> from @/components/ui/input',
        })
      }
    }

    // 11. RULE 8: NO TS SUPPRESSIONS (@ts-ignore, @ts-nocheck, @ts-expect-error)
    if (lineText.includes('@ts-ignore') || lineText.includes('@ts-nocheck') || lineText.includes('@ts-expect-error')) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: 'NO_TS_SUPPRESSION',
        found: trimmed,
        recommended: 'proper TypeScript typing',
      })
    }

    // 12. RULE 9: AVOID ANY
    if (/\bas any\b/.test(lineText) || /:\s*any\b/.test(lineText) || /\bany\[\]/.test(lineText)) {
      if (!lineText.includes('// allow-any')) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: 'AVOID_ANY',
          found: trimmed,
          recommended: 'specific interface, generic, or union type',
        })
      }
    }

    // 13. RULE 10: NO CONSOLE LOGGING
    if (/console\.(log|debug|info)\(/.test(lineText)) {
      violations.push({
        file: relativePath,
        line: lineNum,
        rule: 'NO_CONSOLE_LOG',
        found: trimmed,
        recommended: 'Remove debug logging in production code',
      })
    }
  })
}

console.log('='.repeat(70))
console.log('GENCRAFT — DESIGN SYSTEM AUTOMATED QUALITY GATE AUDIT')
console.log('='.repeat(70))

scanDir(srcDir)

// Run TypeScript compiler check
let tscPassed = false
try {
  execSync('npx tsc --noEmit', { cwd: rootDir, stdio: 'pipe' })
  tscPassed = true
} catch {
  tscPassed = false
}

if (violations.length === 0 && tscPassed) {
  console.log('\nGencraft Design System Audit PASSED (0 violations)')
  console.log('TypeScript Compilation: PASS (0 errors)')
  console.log('Automated quality gate successfully verified.\n')
  process.exit(0)
} else {
  console.log(`\nGencraft Design System Audit FAILED (${violations.length} violations):\n`)
  violations.forEach((v) => {
    console.log(`[${v.rule}] ${v.file}:${v.line}`)
    console.log(`  Found: ${v.found}`)
    console.log(`  Use:   ${v.recommended}\n`)
  })

  // Summary by file
  const byFile = {}
  violations.forEach((v) => {
    byFile[v.file] = (byFile[v.file] || 0) + 1
  })

  // Summary by rule
  const byRule = {}
  violations.forEach((v) => {
    byRule[v.rule] = (byRule[v.rule] || 0) + 1
  })

  console.log('-'.repeat(50))
  console.log('VIOLATIONS BY FILE:')
  Object.entries(byFile).sort((a, b) => b[1] - a[1]).forEach(([file, count]) => {
    console.log(`  • ${file}: ${count}`)
  })
  console.log('-'.repeat(50))
  console.log('VIOLATIONS BY RULE:')
  Object.entries(byRule).forEach(([rule, count]) => {
    console.log(`  • ${rule}: ${count}`)
  })
  console.log('-'.repeat(50))
  console.log(`Total Violations: ${violations.length}`)
  console.log(`TypeScript Status: ${tscPassed ? 'PASS' : 'FAIL (errors found)'}`)
  console.log('Design System Audit FAILED.\n')
  process.exit(1)
}
