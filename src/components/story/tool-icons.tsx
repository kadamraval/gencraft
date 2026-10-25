/**
 * Editing-tool icons that the icon library does not have, drawn on the same 24 pixel grid with the same round 2 pixel line,
 * so they sit beside the library's icons. Each follows the common look of video editors: a razor blade for the cut, an arrow
 * into a bar for "this and everything after", two edges with a two-way arrow for the rolling edit, and a down-pointing tag
 * for a marker.
 */
type IconProps = { className?: string }

const base = { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const

/** A razor blade at an angle, with its slot */
export function RazorIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <g transform="rotate(-45 12 12)">
        <rect x="2.5" y="7.5" width="19" height="9" rx="1.5" />
        <path d="M8 12h8" />
      </g>
    </svg>
  )
}

/** Track select forward: a bar, and an arrow running away from it */
export function TrackSelectIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 5v14" />
      <path d="M9 12h11" />
      <path d="M16 8l4 4-4 4" />
    </svg>
  )
}

/** Rolling edit: the cut between two clips, with an arrow both ways */
export function RollingEditIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M12 4v16" />
      <path d="M3 12h18" />
      <path d="M7 8l-4 4 4 4" />
      <path d="M17 8l4 4-4 4" />
    </svg>
  )
}

/** A marker: a tag that points down at the time it marks */
export function MarkerIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M6 4h12v9l-6 7-6-7z" />
    </svg>
  )
}
