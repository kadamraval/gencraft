import type { CSSProperties, ReactNode } from "react"
import type { SetupStep } from "@/lib/home/onboarding"

/**
 * The animated picture at the top of each first-run step. Plain SVG drawn with the theme's own colours (currentColor and the card, border and
 * foreground tokens), so it looks right in every skin. Motion is CSS only and is switched off for people who asked for less motion.
 */

const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` })
const float = "motion-reduce:animate-none animate-ob-float"
const floatSlow = "motion-reduce:animate-none animate-ob-float-slow"
const pop = "motion-reduce:animate-none animate-ob-pop"
const draw = "motion-reduce:animate-none animate-ob-draw"

function Stage({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 240 150" role="img" aria-hidden="true" className="mx-auto h-36 w-full max-w-sm text-foreground">
      <ellipse cx="120" cy="138" rx="70" ry="6" className="fill-muted" />
      {children}
    </svg>
  )
}

/** A rounded picture frame, a play button or a sound wave: the three things Gencraft makes */
function Welcome() {
  return (
    <Stage>
      <g className={float}>
        <rect x="24" y="40" width="64" height="48" rx="8" className="fill-card stroke-border" strokeWidth="1.5" />
        <circle cx="46" cy="58" r="6" className="fill-muted-foreground" />
        <path d="M30 82 L50 66 L62 76 L72 68 L84 82 Z" className="fill-muted" />
      </g>
      <g className={floatSlow} style={delay(0.6)}>
        <rect x="88" y="22" width="72" height="54" rx="8" className="fill-primary" />
        <path d="M117 38 L117 60 L135 49 Z" className="fill-primary-foreground" />
      </g>
      <g className={float} style={delay(1.2)}>
        <rect x="152" y="58" width="64" height="48" rx="8" className="fill-card stroke-border" strokeWidth="1.5" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect key={i} x={162 + i * 7} y={74 - [4, 9, 14, 8, 12, 6, 3][i]!} width="4" height={[8, 18, 28, 16, 24, 12, 6][i]} rx="2" className="fill-muted-foreground" />
        ))}
      </g>
      <g className={pop} style={delay(0.3)}>
        <path d="M120 96 L123 105 L132 108 L123 111 L120 120 L117 111 L108 108 L117 105 Z" className="fill-primary" />
      </g>
    </Stage>
  )
}

function Account() {
  return (
    <Stage>
      <g className={float}>
        <rect x="76" y="58" width="88" height="64" rx="10" className="fill-card stroke-border" strokeWidth="1.5" />
        <path d="M96 58 V46 a24 24 0 0 1 48 0 V58" fill="none" className="stroke-foreground" strokeWidth="3" strokeLinecap="round" strokeDasharray="120" />
        <circle cx="120" cy="86" r="7" className="fill-primary" />
        <rect x="117" y="88" width="6" height="16" rx="3" className="fill-primary" />
      </g>
      <path d="M184 40 l5 11 11 5 -11 5 -5 11 -5 -11 -11 -5 11 -5 Z" className={`${pop} fill-primary`} style={delay(0.4)} />
    </Stage>
  )
}

/** Five small orbs circling a key: the five providers */
function Keys() {
  return (
    <Stage>
      <g className="origin-center motion-reduce:animate-none animate-ob-orbit" style={{ transformOrigin: "120px 72px" }}>
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2
          return <circle key={i} cx={120 + Math.cos(a) * 56} cy={72 + Math.sin(a) * 40} r="9" className={i % 2 ? "fill-muted-foreground" : "fill-primary"} />
        })}
      </g>
      <circle cx="120" cy="72" r="24" className="fill-card stroke-border" strokeWidth="1.5" />
      <circle cx="113" cy="72" r="6" className="fill-none stroke-foreground" strokeWidth="3" />
      <path d="M119 72 H134 M129 72 v6 M134 72 v5" className={`${draw} fill-none stroke-foreground`} strokeWidth="3" strokeLinecap="round" strokeDasharray="120" />
    </Stage>
  )
}

function Done() {
  return (
    <Stage>
      <circle cx="120" cy="70" r="38" className={`${pop} fill-primary`} />
      <path d="M102 71 L115 84 L140 57" fill="none" className={`${draw} stroke-primary-foreground`} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="120" />
      {[
        [58, 40],
        [182, 44],
        [66, 100],
        [176, 98],
      ].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y! - 8} L${x! + 3} ${y! - 3} L${x! + 8} ${y} L${x! + 3} ${y! + 3} L${x} ${y! + 8} L${x! - 3} ${y! + 3} L${x! - 8} ${y} L${x! - 3} ${y! - 3} Z`} className={`${pop} fill-muted-foreground`} style={delay(0.3 + i * 0.15)} />
      ))}
    </Stage>
  )
}

export function OnboardingArt({ step }: { step: SetupStep }) {
  switch (step) {
    case "account":
    case "pin":
      return <Account />
    case "setup":
      return <Keys />
    case "done":
      return <Done />
    default:
      return <Welcome />
  }
}
