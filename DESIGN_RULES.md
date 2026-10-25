# Gencraft Design System Enforcement & Quality Gate

This document defines the strict automated quality gate for the client app, shared UI components, and TypeScript code, adapted directly from the master `design.md` specification.

---

## 1. Rule 1 — No Arbitrary Font Sizes
Block arbitrary Tailwind font sizes such as:
- `text-[10px]`
- `text-[11px]`
- `text-[11.5px]`
- `text-[12px]`
- `text-[13px]`
- `text-[0.8rem]`

**Require the standard Tailwind typography scale:**
- `text-xs` (12px)
- `text-sm` (14px)
- `text-base` (16px)
- `text-lg` (18px)
- `text-xl` (20px)
- `text-2xl` (24px)
- `text-3xl` (30px)

---

## 2. Rule 2 — Typography & Font Families
Strictly ONE font across the entire app: Inter (`font-sans`). No other fonts permitted.
Flag:
- `font-mono` on normal UI text
- arbitrary `font-[...]`
- inline `fontFamily`

`font-mono` is permitted ONLY for legitimate technical data:
- API keys
- IDs / Hashes
- Code snippets / JSON
- Latency / execution millisecond badges
- Terminal debug logs

---

## 3. Rule 3 — No Arbitrary Design Tokens
Flag arbitrary Tailwind values when they represent visual decisions:
- **Colors**: `bg-[#...]`, `text-[#...]`, `border-[#...]`, `bg-[rgb(...)]`, `text-[hsl(...)]`
  - *Use Semantic Tokens*: `bg-background`, `bg-card`, `bg-secondary`, `bg-primary`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, `ring-ring`
- **Spacing**: `p-[...]`, `px-[...]`, `gap-[...]`, `mt-[...]`, `space-y-[...]`
  - *Use Standard Spacing*: `p-1`, `p-2`, `p-3`, `p-4`, `p-6`, `gap-2`, `gap-3`, `gap-4`, etc.
- **Dimensions**: `w-[347px]`, `h-[61px]`, `h-[48px]`, `min-w-[114px]`
  - *Use Standard Dimensions*: `h-8`, `h-9`, `h-10`, `h-12`, `w-8`, `w-full`, `max-w-md`, `max-w-2xl`, etc.
- **Radius**: `rounded-[11px]`, `rounded-[13px]`, `rounded-[calc(...)]`
  - *Use Standard Radius*: `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full`

---

## 4. Rule 4 — Hardcoded Colors
Flag hex colors (`#000`, `#ffffff`, `#111111`, etc.) inside TS/TSX application code.
- Prefer existing semantic design tokens (`bg-card`, `text-foreground`, `text-muted-foreground`, etc.).
- Allowlist: SVG brand logos (`brand-logos.tsx`), data visualization color bars where color is genuinely data-driven.

---

## 5. Rule 5 — No Inline Styles
Flag JSX inline styles: `style={{ ... }}`.
- Replace with Tailwind utility classes.
- Allowlist: strictly dynamic positioning (e.g. dynamic progress width `%` or CSS canvas animations).

---

## 6. Rule 6 & 7 — 100% ShadCN UI Primitives
Audit raw interactive primitives and replace them with ShadCN components:
- Replace `<button>` with `<Button>` (`@/components/ui/button`)
- Replace `<input>` with `<Input>` (`@/components/ui/input`)
- Replace `<textarea>` with `<Textarea>` (`@/components/ui/textarea`)
- Replace `<select>` with `<Select>` (`@/components/ui/select`)
- Replace custom badges with `<Badge>` (`@/components/ui/badge`)
- Replace custom separators with `<Separator>` (`@/components/ui/separator`)

---

## 7. Rule 8 & 9 — TypeScript Enforcement & Avoid `any`
- `npx tsc --noEmit` must compile with ZERO errors.
- Prohibit `@ts-ignore`, `@ts-nocheck`.
- Prohibit explicit `as any` in application code.

---

## 8. Rule 10 — Console Logging
Remove `console.log`, `console.debug`, `console.info` from production application code.

---

## 9. Rule 14 & 15 — Violation Output & Exit Codes
The automated audit script (`npm run audit:design`) scans all files in `src/`, reporting:
- `[RULE_NAME] file:line`
- `Found: <offending value>`
- `Use: <recommended replacement>`
- Exits with `exit code 0` on clean pass, and `exit code 1` if violations exist.
