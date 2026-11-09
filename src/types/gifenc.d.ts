/** The few parts of gifenc (MIT) the app uses: encode frames into a GIF */
declare module "gifenc" {
  type Palette = number[][]
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): Palette
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette): Uint8Array
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: { palette?: Palette; delay?: number; repeat?: number; transparent?: boolean }): void
    finish(): void
    bytes(): Uint8Array
  }
  const gifenc: {
    quantize: typeof quantize
    applyPalette: typeof applyPalette
    GIFEncoder: typeof GIFEncoder
  }
  export default gifenc
}
