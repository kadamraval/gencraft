# Design System Rules (Automated Enforcement)

Follow the strict quality gate from `DESIGN_RULES.md`:
1. **No arbitrary font sizes**: NEVER use `text-[10px]`, `text-[11px]`, `text-[12px]`. Always use `text-xs`, `text-sm`, `text-base`.
2. **Typography scale**: Strictly ONE font across the entire app: Inter (`font-sans`). No other fonts permitted. Limit `font-mono` to technical data (IDs, keys, latency ms).
3. **No arbitrary tokens**: No `w-[...]`, `h-[...]`, `p-[...]`, `rounded-[...]`. Use standard Tailwind classes (`h-8`, `h-9`, `p-2`, `p-4`, `rounded-xl`).
4. **No hardcoded colors**: No `#fff`, `#000`, `#111`. Use `bg-card`, `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`.
5. **No inline styles**: Replace `style={{ ... }}` with Tailwind classes.
6. **100% ShadCN components**: Always import from `@/components/ui/*`: `Button`, `Input`, `Textarea`, `Select`, `Badge`, `Card`, `Separator`.
7. **Zero TypeScript errors**: Must pass `npx tsc --noEmit`. No `any`, `@ts-ignore`, or `@ts-nocheck`.
