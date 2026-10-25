interface DotGridProps {
  gap?: number
  dotSize?: number
  className?: string
}

export function DotGrid({ gap = 81, dotSize = 1.75, className = "" }: DotGridProps) {
  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <svg
        className="h-full w-full opacity-70 text-muted-foreground/30 transition-opacity duration-300"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="dot-grid-pattern"
            width={gap}
            height={gap}
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx={gap / 2}
              cy={gap / 2}
              r={dotSize}
              fill="currentColor"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot-grid-pattern)" />
      </svg>
    </div>
  )
}
