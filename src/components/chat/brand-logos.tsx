import * as React from "react"
import { ModelLogo } from "@/components/ui/model-logo"
import { logoSvgFor } from "@/components/ui/model-logo"

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

// 1. Google 4-Color Official Logo
export function GoogleLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  )
}

// 2. Google Gemini Sparkle Official DeepMind Logo
export function GeminiLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id="geminiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4A90E2" />
          <stop offset="50%" stopColor="#9B51E0" />
          <stop offset="100%" stopColor="#FF7675" />
        </linearGradient>
      </defs>
      <path
        d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12z"
        fill="url(#geminiGrad)"
      />
    </svg>
  )
}

// 3. fal.ai Official Red/Crimson Clover Aperture Logo
export function FalLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      className={className}
      {...props}
    >
      <g transform="scale(32)">
        <path
          d="M10.318 0c.277 0 .5.225.525.501A5.199 5.199 0 0015.5 5.157c.275.027.501.249.501.526v4.634a.542.542 0 01-.501.526 5.199 5.199 0 00-4.657 4.656.542.542 0 01-.525.501H5.683a.542.542 0 01-.526-.501 5.2 5.2 0 00-4.656-4.656.542.542 0 01-.501-.526V5.683c0-.277.225-.499.501-.526A5.2 5.2 0 005.157.501.543.543 0 015.684 0h4.634zM3.213 7.987v.002c0 2.642 2.173 4.816 4.815 4.818 2.642-.002 4.815-2.176 4.815-4.818v-.002a4.817 4.817 0 00-4.815-4.82c-2.643.001-4.817 2.177-4.815 4.82z"
          fill="#EC0648"
        />
      </g>
    </svg>
  )
}

// 4. Replicate Official Terminal Stack Logo
export function ReplicateLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <rect x="2" y="3.5" width="20" height="3.5" rx="1.5" fill="#0055FF" />
      <rect x="2" y="10.25" width="13" height="3.5" rx="1.5" fill="#0055FF" />
      <rect x="2" y="17" width="6.5" height="3.5" rx="1.5" fill="#0055FF" />
    </svg>
  )
}

// 5. Higgsfield AI Official Neon Wave Logo
export function HiggsfieldLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id="higgsGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#C7F244" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
      </defs>
      <path
        d="M3 15.5c3 0 4.5-4.5 9-4.5s6 4.5 9 4.5"
        stroke="url(#higgsGrad)"
        strokeWidth="2.75"
        strokeLinecap="round"
      />
      <path
        d="M3 8.5c3 0 4.5 4.5 9 4.5s6-4.5 9-4.5"
        stroke="url(#higgsGrad)"
        strokeWidth="2.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

// 6. Kling AI Official Gradient Ribbon Infinity Logo (Authentic Kuaishou Kling Vector)
export function KlingLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      className={className}
      {...props}
    >
      <defs>
        <radialGradient
          id="klingRad1"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="rotate(-59.132 311.591 48.195) scale(310.927 426.086)"
        >
          <stop offset=".095" stopColor="#FFF959" />
          <stop offset=".326" stopColor="#0DF35E" />
          <stop offset=".64" stopColor="#0BF2F9" />
          <stop offset="1" stopColor="#04A6F0" />
        </radialGradient>
        <radialGradient
          id="klingRad2"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="rotate(120.868 138.475 223.808) scale(310.927 426.086)"
        >
          <stop offset=".095" stopColor="#FFF959" />
          <stop offset=".326" stopColor="#0DF35E" />
          <stop offset=".64" stopColor="#0BF2F9" />
          <stop offset="1" stopColor="#04A6F0" />
        </radialGradient>
        <linearGradient
          id="klingLin1"
          x1="332.331"
          y1="38.357"
          x2="385.323"
          y2="210.368"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#003EFF" />
          <stop offset="1" stopColor="#0BFFE7" />
        </linearGradient>
        <linearGradient
          id="klingLin2"
          x1="179.669"
          y1="472.363"
          x2="126.677"
          y2="300.352"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#003EFF" />
          <stop offset="1" stopColor="#0BFFE7" />
        </linearGradient>
      </defs>
      <path
        d="M115.456 293.867a494.813 494.813 0 0142.624-95.04C225.707 81.664 324.373 12.011 378.453 43.221 256.811-27.008 98.091 20.14 23.936 148.565a285.458 285.458 0 00-22.123 48.128c-5.525 15.766 1.963 32.726 16.427 41.088l97.216 56.107v-.021z"
        fill="url(#klingRad1)"
      />
      <path
        d="M396.544 216.832a494.717 494.717 0 01-42.645 95.04c-67.627 117.163-166.294 186.837-220.374 155.605 121.664 70.251 280.384 23.083 354.539-105.344a285.665 285.665 0 0022.123-48.106c5.525-15.744-1.963-32.726-16.427-41.067l-97.216-56.107v-.021z"
        fill="url(#klingRad2)"
      />
      <path
        d="M353.92 311.893c67.627-117.162 78.635-237.44 24.533-268.672-54.037-31.21-152.704 38.486-220.373 155.606 44.245-76.587 123.925-113.387 178.005-82.176 54.059 31.232 62.038 118.613 17.814 195.221l.021.021z"
        fill="url(#klingLin1)"
      />
      <path
        d="M158.08 198.827c-67.627 117.162-78.635 237.44-24.533 268.65 54.058 31.232 152.725-38.442 220.373-155.605-44.245 76.608-123.925 113.408-178.005 82.176-54.059-31.211-62.038-118.613-17.814-195.2l-.021-.021z"
        fill="url(#klingLin2)"
      />
    </svg>
  )
}

// 7. Alibaba Wan / Wanx Official Aperture Logo
export function WanLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id="wanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9.5" stroke="url(#wanGrad)" strokeWidth="2.2" />
      <path
        d="M12 2.5v9.5l8.2 4.7M12 12l-8.2 4.7M12 12V2.5"
        stroke="url(#wanGrad)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

// 8. Seedance (ByteDance) Official Soundwave Visualizer Logo
export function SeedanceLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <rect x="3.5" y="8" width="2.5" height="8" rx="1.25" fill="#10B981" />
      <rect x="7.5" y="4" width="2.5" height="16" rx="1.25" fill="#34D399" />
      <rect x="11.5" y="2" width="2.5" height="20" rx="1.25" fill="#6EE7B7" />
      <rect x="15.5" y="6" width="2.5" height="12" rx="1.25" fill="#34D399" />
      <rect x="19.5" y="9" width="2.5" height="6" rx="1.25" fill="#10B981" />
    </svg>
  )
}

// 9. Runway Official Geometric "R" Logo (Authentic Runway Vector)
export function RunwayLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="currentColor"
      className={className}
      {...props}
    >
      <path d="M392.51 511.69c-62.032 5.67-113.901-67.019-153.657-103.887C218.749 552.665-.15 538.933 0 391.985c.072-61.724 0-212.549 0-272.331C0 98.16 5.899 76.515 16.965 58.16c21-35.599 61.58-58.584 102.906-58.14 62.254.079 212.177-.071 272.639 0 147.084 0 161.053 218.821 15.696 238.523l68.977 68.884c75.785 71.27 18.906 207.396-84.673 204.263zm-33.407-86.199c42.745 44.035 110.984-24.182 66.963-66.869L306.489 239.217h-66.891v66.862l103.365 103.222 16.14 16.19zM72.417 392.056c-.974 61.201 95.66 61.423 94.693 0V119.654c.817-30.525-31.464-54.778-60.613-45.375-1.268.373-2.465.746-3.59 1.197-18.306 6.787-31.013 25.522-30.49 45.074v271.506zM392.51 166.893c61.429.975 61.358-95.524 0-94.556H230.109c12.335 25.974 9.196 66.425 9.418 94.556H392.51z" />
    </svg>
  )
}

// 10. Black Forest Labs / FLUX Official Grid Logo
export function FluxLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      {...props}
    >
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" opacity="0.8" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" opacity="0.8" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" fill="#3B82F6" />
    </svg>
  )
}

// 11. MiniMax (Hailuo AI) Soundwave Monogram Logo
export function MinimaxLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id="minimaxGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <path
        d="M4 18V6l4 6 4-6v12M16 8v10M20 12v6"
        stroke="url(#minimaxGrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// 12. ComfyUI Local Node Graph Logo
export function ComfyLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <circle cx="5" cy="6" r="3" fill="#6366F1" />
      <circle cx="19" cy="6" r="3" fill="#EC4899" />
      <circle cx="12" cy="18" r="3" fill="#10B981" />
      <path
        d="M7 7l5 9 5-9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeDasharray="2 2"
        className="text-muted-foreground"
      />
    </svg>
  )
}

// 13. OpenAI Official Vector Logo (Authentic OpenAI Emerald / Contrast)
export function OpenAILogo({ size = 16, className, color, ...props }: LogoProps & { color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color || "#10A37F"}
      className={className}
      {...props}
    >
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.064l-4.84 2.793a4.498 4.498 0 0 1-6.14-1.65zm-1.258-8.89a4.476 4.476 0 0 1 2.34-1.977v5.679a.78.78 0 0 0 .389.68l5.836 3.369-2.02 1.168a.078.078 0 0 1-.071 0l-4.834-2.793a4.504 4.504 0 0 1-1.64-6.127zm16.599 3.014-5.843-3.37v-2.33a.08.08 0 0 1 .033-.065l4.84-2.793a4.497 4.497 0 0 1 6.14 1.65 4.472 4.472 0 0 1 .535 3.015l-.142-.085-4.783-2.76a.771.771 0 0 0-.78 0zm2.02 5.093v-5.679a.78.78 0 0 0-.389-.68l-5.836-3.369 2.02-1.168a.078.078 0 0 1 .071 0l4.834 2.793a4.504 4.504 0 0 1 1.64 6.127 4.476 4.476 0 0 1-2.34 1.976zM10.74 1.57a4.498 4.498 0 0 1 4.494 4.494v5.583a.071.071 0 0 1-.038.052l-2.02-1.168v-6.737a.795.795 0 0 0-.392-.681L7.999 5.871l-.141-.081a4.476 4.476 0 0 1 2.882-4.22zM8.86 10.08l2.84 1.64-2.84 1.64-2.84-1.64 2.84-1.64z"/>
    </svg>
  )
}

// 14. Anthropic / Claude Official Terracotta Vector Logo
export function AnthropicLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M13.827 3.5h3.693l5.98 17h-3.693l-1.428-4.148H11.58L10.15 20.5H6.458l5.98-17h1.389zm1.386 4.148L12.44 13.5h4.146l-1.373-5.852zM3.5 20.5h3.693L13.173 3.5H9.48L3.5 20.5z"
        fill="#D97706"
      />
    </svg>
  )
}

// 15. OpenRouter Official Vector Logo
export function OpenRouterLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <circle cx="12" cy="12" r="9.5" stroke="#6366F1" strokeWidth="2" />
      <path
        d="M8 12h8M12.5 8l4 4-4 4"
        stroke="#A855F7"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="12" r="2" fill="#6366F1" />
    </svg>
  )
}

// 16. Google Drive Official Vector Logo
export function GoogleDriveLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <path d="M7.71 3.5L1.15 15l3.43 6 6.55-11.5L7.71 3.5z" fill="#0066DA" />
      <path d="M16.29 3.5H7.71l6.56 11.5h8.58L16.29 3.5z" fill="#00AC47" />
      <path d="M14.27 15H4.58L1.15 21h18.27l-5.15-6z" fill="#FFBA00" />
    </svg>
  )
}

// 17. Dropbox Official Vector Logo
export function DropboxLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#0061FF"
      className={className}
      {...props}
    >
      <path d="M6 3.5L0 7.5l6 4 6-4-6-4zm12 0l-6 4 6 4 6-4-6-4zM0 15.5l6 4 6-4-6-4-6 4zm18-4l-6 4 6 4 6-4-6-4zm-6 5.5l-6 4 6 4 6-4-6-4z" />
    </svg>
  )
}

// 18. Cloudflare Official Vector Logo
export function CloudflareLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M18.8 11.3A5.4 5.4 0 0 0 13.5 7a5.5 5.5 0 0 0-5.3 4 4.5 4.5 0 0 0-4.2 4.5c0 2.5 2 4.5 4.5 4.5h10.4a4.5 4.5 0 0 0 4.5-4.5c0-2-1.3-3.7-3.1-4.2z"
        fill="#F38020"
      />
      <path
        d="M14.5 17h4.8a2.5 2.5 0 0 0 2.5-2.5c0-1.2-.8-2.2-2-2.4l-.6-.1-.1-.6a3.5 3.5 0 0 0-3.4-2.4c-1.7 0-3.1 1.2-3.4 2.8l-.1.7-.7.1a3 3 0 0 0-2.3 2.9c0 .2 0 .4.1.5h5.1z"
        fill="#FAAD3F"
      />
    </svg>
  )
}

// 19. DeepSeek Official Vector Logo (Authentic DeepSeek Electric Blue)
export function DeepSeekLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M12 2C6.477 2 2 6.477 2 12c0 2.378.835 4.562 2.232 6.282L3.5 22l4.135-.85A9.957 9.957 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"
        fill="#0D6EFD"
      />
      <path
        d="M8.5 13.5c1.5 1.5 4 2 6.5 1m-5.5-4h.01m4.99 0h.01"
        stroke="#FFFFFF"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

// 20. Meta Llama Official Vector Logo (Authentic Meta Blue Infinity)
export function MetaLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#0668E1"
      className={className}
      {...props}
    >
      <path d="M6.88 5c-2.3 0-4.22 1.4-5.22 3.44C.65 10.48.5 12.72 1.25 14.8c.84 2.33 2.76 4.04 5.17 4.2 1.87.12 3.63-.7 4.88-2.05l.7-.77.7.77c1.25 1.35 3.01 2.17 4.88 2.05 2.41-.16 4.33-1.87 5.17-4.2.75-2.08.6-4.32-.41-6.36C21.34 6.4 19.42 5 17.12 5c-1.94 0-3.77.98-4.87 2.58l-.25.37-.25-.37C10.65 5.98 8.82 5 6.88 5zm0 2.2c1.37 0 2.65.77 3.32 1.98l.8 1.45.8-1.45c.67-1.21 1.95-1.98 3.32-1.98 1.62 0 2.98 1 3.68 2.46.52 1.07.61 2.28.25 3.39-.42 1.29-1.5 2.25-2.85 2.34-1.33.09-2.58-.57-3.23-1.7l-1.97-3.41-1.97 3.41c-.65 1.13-1.9 1.79-3.23 1.7-1.35-.09-2.43-1.05-2.85-2.34-.36-1.11-.27-2.32.25-3.39.7-1.46 2.06-2.46 3.68-2.46z" />
    </svg>
  )
}

// 21. ElevenLabs Official Vector Logo
export function ElevenLabsLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      {...props}
    >
      <rect x="7" y="4" width="3.5" height="16" rx="1.75" />
      <rect x="13.5" y="4" width="3.5" height="16" rx="1.75" />
    </svg>
  )
}

// 22. Stability AI Official Vector Logo
export function StabilityLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <circle cx="12" cy="12" r="3" fill="#7C3AED" />
      <circle cx="12" cy="4.5" r="2" fill="#7C3AED" />
      <circle cx="12" cy="19.5" r="2" fill="#7C3AED" />
      <circle cx="4.5" cy="12" r="2" fill="#7C3AED" />
      <circle cx="19.5" cy="12" r="2" fill="#7C3AED" />
      <circle cx="6.7" cy="6.7" r="1.5" fill="#A78BFA" />
      <circle cx="17.3" cy="6.7" r="1.5" fill="#A78BFA" />
      <circle cx="6.7" cy="17.3" r="1.5" fill="#A78BFA" />
      <circle cx="17.3" cy="17.3" r="1.5" fill="#A78BFA" />
    </svg>
  )
}

// 23. Recraft Official Vector Logo
export function RecraftLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <rect width="24" height="24" rx="6" fill="#FF5722" />
      <path
        d="M7 17V7h5a3 3 0 0 1 3 3c0 1.2-.7 2.2-1.7 2.7L17 17h-3l-3-3.5H9.5V17H7zm2.5-5.5h2.5a1.5 1.5 0 0 0 0-3H9.5v3z"
        fill="#FFFFFF"
      />
    </svg>
  )
}

// 24. Ideogram Official Vector Logo
export function IdeogramLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <rect width="24" height="24" rx="6" fill="#FF7A00" />
      <circle cx="12" cy="7" r="2" fill="#FFFFFF" />
      <rect x="10.5" y="11" width="3" height="7" rx="1.5" fill="#FFFFFF" />
    </svg>
  )
}

// 25. Luma AI Official Dream Machine Logo
export function LumaLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id="lumaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F43F5E" />
          <stop offset="50%" stopColor="#FB923C" />
          <stop offset="100%" stopColor="#FACC15" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9" stroke="url(#lumaGrad)" strokeWidth="2.5" />
      <circle cx="12" cy="12" r="3.5" fill="url(#lumaGrad)" />
    </svg>
  )
}

// 26. LTX Video (Lightricks) Official Lens Logo
export function LTXLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <rect width="24" height="24" rx="6" fill="#18181B" />
      <circle cx="12" cy="12" r="7" stroke="#38BDF8" strokeWidth="2" />
      <path
        d="M12 5v4m0 6v4M5 12h4m6 0h4"
        stroke="#38BDF8"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

// 27. Hunyuan (Tencent) Official Hexagon Logo
export function HunyuanLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M12 2.5L20 7.2v9.6L12 21.5l-8-4.7V7.2L12 2.5z"
        stroke="#0052D9"
        strokeWidth="2"
      />
      <path
        d="M12 7.5L16 10v4l-4 2.5L8 14v-4l4-2.5z"
        fill="#0052D9"
      />
    </svg>
  )
}

// Universal Provider Logo Resolver (Authentic Vector Identity for Each Provider Host)
export function ProviderLogo({
  provider,
  size = 18,
  className,
}: {
  provider: string
  size?: number
  className?: string
}) {
  const p = provider.toLowerCase()
  switch (p) {
    case "fal":
    case "fal.ai":
      return <FalLogo size={size} className={className} />
    case "replicate":
      return <ReplicateLogo size={size} className={className} />
    case "gemini":
    case "google gemini":
      return <GeminiLogo size={size} className={className} />
    case "google":
      return <GoogleLogo size={size} className={className} />
    case "openai":
      return <OpenAILogo size={size} className={className} />
    case "openrouter":
      return <OpenRouterLogo size={size} className={className} />
    case "anthropic":
    case "claude":
      return <AnthropicLogo size={size} className={className} />
    case "higgsfield":
      return <HiggsfieldLogo size={size} className={className} />
    case "runway":
      return <RunwayLogo size={size} className={className} />
    case "comfyui":
    case "local":
      return <ComfyLogo size={size} className={className} />
    default:
      return <FalLogo size={size} className={className} />
  }
}

// 28. Mistral AI Official Warm Orange Cascade Logo
export function MistralLogo({ size = 16, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <rect width="24" height="24" rx="5" fill="#FF7000" />
      <path
        d="M5 6h3.2v12H5zm5.4 3.5h3.2v8.5h-3.2zm5.4-3.5H19v12h-3.2z"
        fill="#FFFFFF"
      />
    </svg>
  )
}

// Universal Brand / Model Creator Logo Resolver (Authentic Vector Identity for Every Model Family)
export function BrandLogo({
  brand,
  provider,
  size = 16,
  className,
}: {
  brand: string
  provider?: string
  size?: number
  className?: string
}) {
  if (!brand) {
    if (provider) return <ProviderLogo provider={provider} size={size} className={className} />
    return <FalLogo size={size} className={className} />
  }

  // Exact maker logo from the bundled brand set (maker first, provider second)
  if (!brand.startsWith("http") && !brand.startsWith("data:") && logoSvgFor({ name: brand, provider })) {
    return <ModelLogo name={brand} provider={provider} size={size} className={className} />
  }

  // Support direct custom image URL / data URI
  if (brand.startsWith("http://") || brand.startsWith("https://") || brand.startsWith("data:")) {
    return (
      <img
        src={brand}
        alt=""
        width={size}
        height={size}
        className={`object-contain rounded shrink-0 ${className || ""}`}
      />
    )
  }

  const b = brand.toLowerCase()
  if (b.includes("deepseek")) return <DeepSeekLogo size={size} className={className} />
  if (b.includes("meta") || b.includes("llama") || b.includes("musicgen")) return <MetaLogo size={size} className={className} />
  if (b.includes("elevenlabs") || b.includes("eleven") || b.includes("f5")) return <ElevenLabsLogo size={size} className={className} />
  if (b.includes("stability") || b.includes("stable audio") || b.includes("sdxl"))
    return <StabilityLogo size={size} className={className} />
  if (b.includes("recraft")) return <RecraftLogo size={size} className={className} />
  if (b.includes("ideogram")) return <IdeogramLogo size={size} className={className} />
  if (b.includes("kling") || b.includes("kuaishou")) return <KlingLogo size={size} className={className} />
  if (b.includes("veo") || b.includes("imagen")) return <GoogleLogo size={size} className={className} />
  if (b.includes("gemini")) return <GeminiLogo size={size} className={className} />
  if (b.includes("google")) return <GoogleLogo size={size} className={className} />
  if (b.includes("cinema") || b.includes("higgsfield")) return <HiggsfieldLogo size={size} className={className} />
  if (b.includes("wan") || b.includes("qwen") || b.includes("alibaba")) return <WanLogo size={size} className={className} />
  if (b.includes("seedance") || b.includes("bytedance")) return <SeedanceLogo size={size} className={className} />
  if (b.includes("flux") || b.includes("bfl") || b.includes("black forest")) return <FluxLogo size={size} className={className} />
  if (b.includes("runway") || b.includes("gen-3") || b.includes("gen3")) return <RunwayLogo size={size} className={className} />
  if (b.includes("minimax") || b.includes("hailuo")) return <MinimaxLogo size={size} className={className} />
  if (b.includes("luma") || b.includes("ray")) return <LumaLogo size={size} className={className} />
  if (b.includes("ltx") || b.includes("lightricks")) return <LTXLogo size={size} className={className} />
  if (b.includes("hunyuan") || b.includes("tencent")) return <HunyuanLogo size={size} className={className} />
  if (b.includes("claude") || b.includes("anthropic")) return <AnthropicLogo size={size} className={className} />
  if (b.includes("mistral")) return <MistralLogo size={size} className={className} />
  if (
    b.includes("gpt") ||
    b.includes("dall-e") ||
    b.includes("sora") ||
    b.includes("o3") ||
    b.includes("o1") ||
    b.includes("openai") ||
    b.includes("tts-1") ||
    b.includes("whisper") ||
    b.includes("text-embedding")
  )
    return <OpenAILogo size={size} className={className} />
  if (b.includes("comfy")) return <ComfyLogo size={size} className={className} />
  if (b.includes("replicate")) return <ReplicateLogo size={size} className={className} />
  if (b.includes("openrouter")) return <OpenRouterLogo size={size} className={className} />
  if (b.includes("fal")) return <FalLogo size={size} className={className} />

  // If provider was explicitly passed (e.g., direct vs 3rd party host fallback)
  if (provider) {
    return <ProviderLogo provider={provider} size={size} className={className} />
  }

  return <ProviderLogo provider={brand} size={size} className={className} />
}
