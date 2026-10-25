import type { ReactNode } from "react"
import { Link2 } from "lucide-react"

/** Small outline glyphs for the social platforms, drawn to match the other icons. Anything else gets a link icon. */
const GLYPHS: Record<string, ReactNode> = {
  Instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" />
    </>
  ),
  X: (
    <>
      <path d="M4 4l16 16" />
      <path d="M20 4L4 20" />
    </>
  ),
  Facebook: <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8.5A.5.5 0 0 1 14 8z" />,
  LinkedIn: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 10v6M8 7.5v.01M12 16v-6M12 12.5a2.5 2.5 0 0 1 5 0V16" />
    </>
  ),
  YouTube: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10 9.5v5l4.5-2.5z" />
    </>
  ),
  TikTok: <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.3 2.6 2 4.3 5 4.5" />,
  Pinterest: <path d="M12 21l1.5-7M9.5 13.5C8 10.5 9.5 7 12.5 7a3.5 3.5 0 0 1 1 6.8c-1.2.4-2.2-.2-2.6-1.2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />,
}

export function SocialIcon({ platform, className }: { platform: string; className?: string }) {
  const glyph = GLYPHS[platform]
  if (!glyph) return <Link2 className={className} />
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {glyph}
    </svg>
  )
}

/** The address to open for a link or an @handle */
export function socialHref(platform: string, value: string): string {
  const v = value.trim()
  if (/^https?:\/\//i.test(v)) return v
  if (/^[\w.-]+\.[a-z]{2,}/i.test(v)) return `https://${v}`
  const handle = v.replace(/^@/, "")
  const base: Record<string, string> = { Instagram: "https://instagram.com/", X: "https://x.com/", Facebook: "https://facebook.com/", LinkedIn: "https://linkedin.com/in/", YouTube: "https://youtube.com/@", TikTok: "https://tiktok.com/@", Pinterest: "https://pinterest.com/" }
  return `${base[platform] ?? "https://"}${handle}`
}
