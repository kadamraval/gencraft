/**
 * Telling whether a file is one you already have, three ways:
 *  - the same file: its bytes give the same SHA-256 (a copy under another name is still caught);
 *  - the same name and size: probably the same file saved again, though its bytes differ;
 *  - the same picture: a picture is shrunk to 9 by 8 grey squares and each square is compared with its right neighbour, giving 64 yes/no
 *    marks (a "difference hash"). Pictures that look alike have almost the same marks even when they are resized, recompressed or
 *    saved in another format, so a few differing marks means a look-alike.
 */

export interface Print {
  /** SHA-256 of the file's bytes, in hex */
  hash: string
  /** 64 marks of how the picture looks, as 16 hex letters. Pictures only. */
  look?: string
  bytes: number
}

/** How many of the 64 marks may differ for two pictures to count as the same picture */
export const LOOK_ALIKE_WITHIN = 6

const hexToBits = (hex: string): number[] => [...hex].flatMap((c) => {
  const n = parseInt(c, 16)
  return [(n >> 3) & 1, (n >> 2) & 1, (n >> 1) & 1, n & 1]
})

/** How many marks differ between two looks */
export function differences(a: string, b: string): number {
  if (a.length !== b.length) return 64
  const x = hexToBits(a)
  const y = hexToBits(b)
  return x.reduce((n, bit, i) => n + (bit === y[i] ? 0 : 1), 0)
}

/** The 64 marks from a picture shrunk to 9 wide and 8 tall in grey (72 numbers, row by row): is each square brighter than the one to its right? */
export function lookOf(grey: number[]): string {
  if (grey.length !== 72) throw new Error("A look needs 9 by 8 grey squares.")
  let bits = ""
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) bits += grey[row * 9 + col]! > grey[row * 9 + col + 1]! ? "1" : "0"
  let hex = ""
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  return hex
}

const toHex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")

async function hashOf(blob: Blob): Promise<string> {
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined
  const bytes = await blob.arrayBuffer()
  // Without the browser's crypto (an insecure page), the size and the first and last 64 KB stand in for the whole
  if (!subtle) {
    const view = new Uint8Array(bytes)
    let h = 2166136261
    const take = (from: number, to: number) => {
      for (let i = from; i < to; i++) h = Math.imul(h ^ view[i]!, 16777619)
    }
    take(0, Math.min(view.length, 65536))
    take(Math.max(0, view.length - 65536), view.length)
    return `weak-${view.length}-${(h >>> 0).toString(16)}`
  }
  return toHex(await subtle.digest("SHA-256", bytes))
}

async function lookFromPicture(blob: Blob): Promise<string | undefined> {
  try {
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement("canvas")
    canvas.width = 9
    canvas.height = 8
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return undefined
    ctx.drawImage(bitmap, 0, 0, 9, 8)
    bitmap.close?.()
    const { data } = ctx.getImageData(0, 0, 9, 8)
    const grey: number[] = []
    for (let i = 0; i < data.length; i += 4) grey.push(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!)
    return lookOf(grey)
  } catch {
    return undefined
  }
}

export async function fingerprint(blob: Blob): Promise<Print> {
  const [hash, look] = await Promise.all([hashOf(blob), blob.type.startsWith("image/") ? lookFromPicture(blob) : Promise.resolve(undefined)])
  return { hash, look, bytes: blob.size }
}

export interface KnownFile {
  id: string
  projectId: string
  title: string
  type: string
  bytes: number
  hash?: string
  look?: string
}

export type Duplicate = { kind: "same" | "named" | "similar"; of: string }

/** Whether a file is already in the library (in the same project), and how: the same file, the same name and size, or a look-alike picture */
export function findDuplicate(file: { projectId: string; title: string; type: string; print: Print }, known: KnownFile[]): Duplicate | undefined {
  const mine = known.filter((k) => k.projectId === file.projectId && k.type === file.type)
  const same = mine.find((k) => k.hash && k.hash === file.print.hash)
  if (same) return { kind: "same", of: same.id }
  const named = mine.find((k) => k.title.trim().toLowerCase() === file.title.trim().toLowerCase() && k.bytes === file.print.bytes)
  if (named) return { kind: "named", of: named.id }
  if (file.print.look) {
    const alike = mine.find((k) => k.look && differences(k.look, file.print.look!) <= LOOK_ALIKE_WITHIN)
    if (alike) return { kind: "similar", of: alike.id }
  }
  return undefined
}
