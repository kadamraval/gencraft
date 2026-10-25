import { Compositor } from "./compositor/compositor"
import type { ClipFx } from "./edit-model"

/**
 * One small compositor shared by every card in the Effects and Transition tabs, because a window can only hold so many graphics contexts.
 * The cards draw sample pictures through the same shaders the cut uses, so a card shows what the effect will really do.
 */

export const PREVIEW_W = 192
export const PREVIEW_H = 108

let shared: Compositor | null | undefined
const scenes = new Map<string, HTMLCanvasElement>()

/** The shared compositor, or null where the window has no WebGL 2 */
export function previewCompositor(): Compositor | null {
  if (shared !== undefined) return shared
  try {
    shared = Compositor.supported() ? new Compositor(PREVIEW_W, PREVIEW_H) : null
  } catch {
    shared = null
  }
  return shared
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas")
  c.width = PREVIEW_W
  c.height = PREVIEW_H
  return [c, c.getContext("2d")!]
}

/** A sample picture: "a" and "b" are two plain scenes for transitions, "photo" is a dusk landscape with a person and colour chips, so grades, glow and grain show */
export function scene(name: "a" | "b" | "photo"): HTMLCanvasElement {
  const have = scenes.get(name)
  if (have) return have
  const [c, g] = canvas()
  const W = PREVIEW_W
  const H = PREVIEW_H
  const fill = (color: string, draw: () => void) => {
    g.fillStyle = color
    draw()
  }
  if (name === "photo") {
    const sky = g.createLinearGradient(0, 0, 0, H * 0.62)
    sky.addColorStop(0, "#26345f") // allow-color
    sky.addColorStop(0.55, "#d9736a") // allow-color
    sky.addColorStop(1, "#f6d68f") // allow-color
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)
    const glow = g.createRadialGradient(W * 0.7, H * 0.5, 2, W * 0.7, H * 0.5, H * 0.45)
    glow.addColorStop(0, "rgba(255,248,224,0.95)") // allow-color
    glow.addColorStop(1, "rgba(255,248,224,0)") // allow-color
    g.fillStyle = glow
    g.fillRect(0, 0, W, H)
    fill("#fff8e1", () => { // allow-color
      g.beginPath()
      g.arc(W * 0.7, H * 0.5, 6, 0, Math.PI * 2)
      g.fill()
    })
    fill("#232a52", () => { // allow-color
      g.beginPath()
      g.moveTo(0, H * 0.62)
      g.lineTo(W * 0.18, H * 0.4)
      g.lineTo(W * 0.34, H * 0.55)
      g.lineTo(W * 0.5, H * 0.36)
      g.lineTo(W * 0.78, H * 0.62)
      g.closePath()
      g.fill()
    })
    const lake = g.createLinearGradient(0, H * 0.62, 0, H)
    lake.addColorStop(0, "#c9706a") // allow-color
    lake.addColorStop(1, "#1f2a4a") // allow-color
    g.fillStyle = lake
    g.fillRect(0, H * 0.62, W, H * 0.38)
    fill("rgba(255,240,200,0.55)", () => g.fillRect(W * 0.62, H * 0.66, W * 0.16, 2)) // allow-color
    fill("rgba(255,240,200,0.35)", () => g.fillRect(W * 0.65, H * 0.72, W * 0.1, 2)) // allow-color
    // A person: head, hair and a red jacket
    fill("#c0392b", () => g.fillRect(W * 0.14, H * 0.58, 26, 30)) // allow-color
    fill("#e8b496", () => { // allow-color
      g.beginPath()
      g.arc(W * 0.14 + 13, H * 0.5, 9, 0, Math.PI * 2)
      g.fill()
    })
    fill("#3b2a20", () => { // allow-color
      g.beginPath()
      g.arc(W * 0.14 + 13, H * 0.47, 9, Math.PI, Math.PI * 2)
      g.fill()
    })
    // A bright lamp and four colour chips
    fill("#ffffff", () => g.fillRect(W * 0.4, H * 0.7, 5, 5)) // allow-color
    ;["#e63946", "#2a9d8f", "#3a86ff", "#ffd166"].forEach((color, i) => fill(color, () => g.fillRect(W * 0.04 + i * 14, H * 0.9, 12, 8))) // allow-color
  } else {
    const [a, b] = name === "a" ? ["#1d4ed8", "#38bdf8"] : ["#c2410c", "#facc15"] // allow-color
    const grad = g.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, a)
    grad.addColorStop(1, b)
    g.fillStyle = grad
    g.fillRect(0, 0, W, H)
    g.fillStyle = "rgba(255,255,255,0.85)" // allow-color
    if (name === "a") {
      g.beginPath()
      g.arc(W * 0.3, H * 0.35, 20, 0, Math.PI * 2)
      g.fill()
    } else g.fillRect(W * 0.55, H * 0.2, 44, 44)
    g.fillStyle = "rgba(0,0,0,0.35)" // allow-color
    g.fillRect(0, H * 0.72, W, H * 0.28)
  }
  scenes.set(name, c)
  return c
}

/** Draws the sample photo through a look onto a card's own canvas. `time` moves grain, glitch and light leaks. Returns false when there is no graphics card. */
export function paintEffect(target: HTMLCanvasElement, fx: ClipFx, time: number): boolean {
  const comp = previewCompositor()
  if (!comp) return false
  comp.render({ base: [{ source: scene("photo"), sw: PREVIEW_W, sh: PREVIEW_H, alpha: 1, fx, time }], overlays: [] })
  target.getContext("2d")?.drawImage(comp.canvas, 0, 0, target.width, target.height)
  return true
}
