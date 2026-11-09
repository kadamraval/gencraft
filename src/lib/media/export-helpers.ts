import gifenc from "gifenc"

const { GIFEncoder, applyPalette, quantize } = gifenc

/**
 * Small jobs on a file that need no model: a still from a clip, a short GIF, a script as a PDF. They run in the app, cost nothing and
 * work with any provider.
 */

/** A clip loaded so its pixels can be read: a provider's address may forbid reading them, so the file is fetched into memory first */
async function readableVideo(url: string): Promise<{ video: HTMLVideoElement; done: () => void }> {
  let src = url
  let made: string | undefined
  if (!url.startsWith("blob:") && !url.startsWith("data:")) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`The clip could not be read (HTTP ${res.status}).`)
    made = URL.createObjectURL(await res.blob())
    src = made
  }
  const video = document.createElement("video")
  video.muted = true
  video.playsInline = true
  video.preload = "auto"
  video.src = src
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error("The clip could not be opened."))
  })
  return { video, done: () => made && URL.revokeObjectURL(made) }
}

const seek = (video: HTMLVideoElement, t: number) =>
  new Promise<void>((resolve) => {
    video.onseeked = () => resolve()
    video.currentTime = Math.min(Math.max(0, t), Math.max(0, video.duration - 0.05))
  })

/** The frame at `time` seconds as a PNG */
export async function saveFrame(url: string, time: number): Promise<Blob> {
  const { video, done } = await readableVideo(url)
  try {
    await seek(video, time)
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext("2d")!.drawImage(video, 0, 0)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The frame could not be saved."))), "image/png"))
  } finally {
    done()
  }
}

/** A looping GIF of `seconds` from `start`, at most `width` wide */
export async function makeGif(url: string, start: number, seconds = 3, fps = 10, width = 480): Promise<Blob> {
  const { video, done } = await readableVideo(url)
  try {
    const scale = Math.min(1, width / video.videoWidth)
    const w = Math.max(1, Math.round(video.videoWidth * scale))
    const h = Math.max(1, Math.round(video.videoHeight * scale))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!
    const gif = GIFEncoder()
    const from = Math.min(start, Math.max(0, video.duration - seconds))
    const frames = Math.max(1, Math.round(Math.min(seconds, video.duration) * fps))
    for (let i = 0; i < frames; i++) {
      await seek(video, from + i / fps)
      ctx.drawImage(video, 0, 0, w, h)
      const { data } = ctx.getImageData(0, 0, w, h)
      const palette = quantize(data, 256)
      gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay: Math.round(1000 / fps) })
    }
    gif.finish()
    return new Blob([gif.bytes().slice().buffer as ArrayBuffer], { type: "image/gif" })
  } finally {
    done()
  }
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** Prints a script in the standard screenplay layout; the print window offers Save as PDF */
export function printScript(title: string, blocks: Array<{ type: string; text: string }>) {
  const style: Record<string, string> = {
    scene: "margin:24px 0 12px;font-weight:bold;text-transform:uppercase",
    action: "margin:12px 0",
    character: "margin:12px 0 0 2.2in;text-transform:uppercase",
    parenthetical: "margin:0 0 0 1.6in;max-width:2in",
    dialogue: "margin:0 0 0 1in;max-width:3.5in",
    transition: "margin:12px 0;text-align:right;text-transform:uppercase",
    act: "margin:24px 0;text-align:center;font-weight:bold;text-transform:uppercase",
    note: "margin:12px 0;color:gray;font-style:italic",
  }
  const body = blocks
    .filter((b) => b.text.trim())
    .map((b) => `<p style="${style[b.type] ?? style.action}">${escape(b.type === "parenthetical" && !b.text.startsWith("(") ? `(${b.text})` : b.text).replace(/\n/g, "<br>")}</p>`)
    .join("")
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title || "Script")}</title><style>@page{size:letter;margin:1in 1in 1in 1.5in}body{font-family:"Courier Prime","Courier New",monospace;font-size:12pt;line-height:1.2;color:black}h1{text-align:center;text-transform:uppercase;font-size:12pt;margin:3in 0 0;page-break-after:always}</style></head><body><h1>${escape(title || "Untitled")}</h1>${body}</body></html>`
  const frame = document.createElement("iframe")
  frame.style.position = "fixed"
  frame.style.width = "0"
  frame.style.height = "0"
  frame.style.border = "0"
  document.body.appendChild(frame)
  const doc = frame.contentDocument!
  doc.open()
  doc.write(html)
  doc.close()
  setTimeout(() => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 60_000)
  }, 200)
}
