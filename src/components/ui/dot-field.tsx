import * as React from "react"

export interface DotFieldProps {
  dotRadius?: number
  dotSpacing?: number
  baseAlpha?: number
  cursorRadius?: number
  cursorForce?: number
  bulgeOnly?: boolean
  bulgeStrength?: number
  glowRadius?: number
  sparkle?: boolean
  waveAmplitude?: number
  gradientFrom?: string
  gradientTo?: string
  glowColor?: string
  className?: string
  isDark?: boolean
}

/**
 * DotField: React Bits interactive background component
 * https://reactbits.dev/c/backgrounds/dot-field
 * Features:
 * - Barely-there, faint & subtle ambient dot texture (ultra-low opacity)
 * - Interactive cursor bulge distortion (dots smoothly move away on hover)
 * - Gentle proximity glow on hover without overwhelming glare
 * - 60FPS canvas rendering with lerped mouse inertia
 */
export function DotField({
  dotRadius = 1.0,
  dotSpacing = 32,
  baseAlpha,
  cursorRadius = 350,
  cursorForce = 0.1,
  bulgeOnly = true,
  bulgeStrength = 48,
  glowRadius = 150,
  sparkle = false,
  waveAmplitude = 0,
  gradientFrom,
  gradientTo,
  glowColor,
  className = "",
  isDark = true,
}: DotFieldProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)

  // Track target and smoothly interpolated mouse coordinates
  const mouseRef = React.useRef({
    targetX: -9999,
    targetY: -9999,
    currentX: -9999,
    currentY: -9999,
    isActive: false,
  })

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationFrameId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)
    let dpr = Math.min(window.devicePixelRatio || 1, 2)

    const handleResize = () => {
      if (!canvas) return
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    handleResize()
    window.addEventListener("resize", handleResize)

    // Global pointer tracking (since canvas has pointer-events: none)
    const handlePointerMove = (e: PointerEvent) => {
      mouseRef.current.targetX = e.clientX
      mouseRef.current.targetY = e.clientY
      mouseRef.current.isActive = true
    }

    const handlePointerLeave = () => {
      mouseRef.current.isActive = false
      mouseRef.current.targetX = -9999
      mouseRef.current.targetY = -9999
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    window.addEventListener("pointerleave", handlePointerLeave, { passive: true })

    // Animation time tracker for subtle optional wave
    let time = 0

    // Render loop
    const render = () => {
      time += 0.015
      ctx.clearRect(0, 0, width, height)

      // Smooth mouse lerp for inertia
      const mouse = mouseRef.current
      if (mouse.isActive) {
        if (mouse.currentX === -9999) {
          mouse.currentX = mouse.targetX
          mouse.currentY = mouse.targetY
        } else {
          mouse.currentX += (mouse.targetX - mouse.currentX) * 0.12
          mouse.currentY += (mouse.targetY - mouse.currentY) * 0.12
        }
      } else {
        mouse.currentX += (-9999 - mouse.currentX) * 0.08
        mouse.currentY += (-9999 - mouse.currentY) * 0.08
      }

      // Faint, barely-there ambient dot opacity (ultra-low contrast)
      const effectiveAlpha = baseAlpha !== undefined ? baseAlpha : isDark ? 0.06 : 0.05
      const baseR = isDark ? 190 : 80
      const baseG = isDark ? 195 : 85
      const baseB = isDark ? 205 : 95

      const glowR = isDark ? 220 : 50
      const glowG = isDark ? 225 : 50
      const glowB = isDark ? 235 : 60

      // Calculate grid counts
      const cols = Math.ceil(width / dotSpacing) + 1
      const rows = Math.ceil(height / dotSpacing) + 1
      const offsetX = (width % dotSpacing) / 2
      const offsetY = (height % dotSpacing) / 2

      const mx = mouse.currentX
      const my = mouse.currentY

      for (let c = 0; c < cols; c++) {
        const ox = offsetX + c * dotSpacing
        for (let r = 0; r < rows; r++) {
          const oy = offsetY + r * dotSpacing

          // Base coordinates
          let renderX = ox
          let renderY = oy

          // Optional wave displacement
          if (waveAmplitude > 0) {
            renderY += Math.sin(time + ox * 0.005 + oy * 0.005) * waveAmplitude
          }

          // Distance from mouse
          const dx = renderX - mx
          const dy = renderY - my
          const dist = Math.sqrt(dx * dx + dy * dy)

          let currentRadius = dotRadius
          let currentAlpha = effectiveAlpha

          // Cursor interaction: Bulge effect
          if (dist < cursorRadius && dist > 0) {
            const normDist = dist / cursorRadius // 0 to 1
            // Smooth cosine bulge curve
            const bulgeFactor = Math.sin((1 - normDist) * Math.PI * 0.5)
            const bulge = bulgeFactor * bulgeStrength

            if (bulgeOnly) {
              // Bulge radially away from cursor
              const angle = Math.atan2(dy, dx)
              renderX += Math.cos(angle) * bulge
              renderY += Math.sin(angle) * bulge
            } else {
              // Physics push
              renderX += (dx / dist) * bulge * cursorForce
              renderY += (dy / dist) * bulge * cursorForce
            }

            // Soft gentle hover glow around cursor (never blinding)
            if (dist < glowRadius) {
              const glowFactor = 1 - dist / glowRadius
              currentAlpha = effectiveAlpha + glowFactor * (isDark ? 0.28 : 0.22)
              currentRadius = dotRadius + glowFactor * 0.45
            }
          }

          // Draw the dot
          ctx.beginPath()
          ctx.arc(renderX, renderY, currentRadius, 0, Math.PI * 2)

          if (dist < glowRadius) {
            ctx.fillStyle = `rgba(${glowR}, ${glowG}, ${glowB}, ${currentAlpha})`
          } else {
            ctx.fillStyle = `rgba(${baseR}, ${baseG}, ${baseB}, ${currentAlpha})`
          }

          ctx.fill()
        }
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener("resize", handleResize)
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerleave", handlePointerLeave)
    }
  }, [
    dotRadius,
    dotSpacing,
    baseAlpha,
    cursorRadius,
    cursorForce,
    bulgeOnly,
    bulgeStrength,
    glowRadius,
    sparkle,
    waveAmplitude,
    gradientFrom,
    gradientTo,
    glowColor,
    isDark,
  ])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ display: "block" }}
      aria-hidden="true"
    />
  )
}
