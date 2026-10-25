import { resolveLogoSlug, type LogoSubject } from "@/lib/registry/logo-rules"
import { cn } from "@/lib/utils"

const RAW = import.meta.glob("/src/assets/logos/*.svg", { query: "?raw", import: "default", eager: true }) as Record<string, string>

const LOGOS: Record<string, string> = Object.fromEntries(
  Object.entries(RAW).map(([file, svg]) => [file.split("/").pop()!.replace(/\.svg$/, ""), svg]),
)

/** Resolves a bundled brand SVG for the subject, or null when nothing matches. */
export function logoSvgFor(subject: LogoSubject): string | null {
  const slug = resolveLogoSlug(subject)
  return slug ? (LOGOS[slug] ?? null) : null
}

function sized(svg: string, size: number): string {
  return svg
    .replace(/\swidth="[^"]*"/, ` width="${size}"`)
    .replace(/\sheight="[^"]*"/, ` height="${size}"`)
    .replace(/\sstyle="[^"]*"/, "")
}

const MONO_CLASS: Record<number, string> = {
  12: "h-3 w-3",
  14: "h-3.5 w-3.5",
  16: "h-4 w-4",
  18: "h-5 w-5",
  24: "h-6 w-6",
}

interface ModelLogoProps extends LogoSubject {
  size?: number
  className?: string
}

/** Exact brand mark for a model's maker. Falls back to the serving provider, then a monogram. */
export function ModelLogo({ size = 16, className, ...subject }: ModelLogoProps) {
  const svg = logoSvgFor(subject)
  if (svg) {
    return (
      <span
        role="img"
        aria-label={subject.name ?? subject.provider ?? "logo"}
        className={cn("inline-flex flex-shrink-0 items-center justify-center text-foreground", className)}
        dangerouslySetInnerHTML={{ __html: sized(svg, size) }}
      />
    )
  }
  const initial = (subject.name ?? subject.provider ?? "?").trim().charAt(0).toUpperCase()
  return (
    <span
      className={cn(
        "inline-flex flex-shrink-0 items-center justify-center rounded bg-secondary text-xs font-semibold text-muted-foreground",
        MONO_CLASS[size] ?? "h-4 w-4",
        className,
      )}
    >
      {initial}
    </span>
  )
}
