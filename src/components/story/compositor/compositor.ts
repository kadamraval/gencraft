import { BLIT_FRAGMENT, LAYER_FRAGMENT, TRANSITION_MAIN, TRANSITION_PRELUDE, VERTEX, readTransitionUniforms } from "./shaders"
import type { TransitionUniform } from "./shaders"
import type { ClipFx } from "../edit-model"

/**
 * The compositor draws one frame of the cut on the graphics card: the main track (one clip, or two while a transition runs), then
 * each layer above it with its blend, onto a canvas. The preview and the export both use it, so what you see is what you export.
 * Where WebGL 2 is not there, `Compositor.supported()` is false and the callers keep the older 2D drawing.
 */

export interface LayerInput {
  source: TexImageSource
  /** The source's own size in pixels */
  sw: number
  sh: number
  /** The look with animated fields already worked out for this moment (see resolveKeys) */
  fx?: ClipFx
  /** 0 to 1: opacity with the fades in it */
  alpha: number
  /** Seconds into the clip: grain, glitch and light leaks move with it */
  time?: number
}

export interface TransitionInput {
  /** The transition's shader text (see shaders.ts) */
  glsl: string
  /** Values for the settings the shader declares, by name */
  params?: Record<string, number | number[] | boolean>
  /** 0 to 1 */
  progress: number
}

export interface FrameInput {
  /** The main track: one clip, or the clip going out and the clip coming in */
  base: LayerInput[]
  transition?: TransitionInput
  /** Layers above the main track, the lowest first */
  overlays: LayerInput[]
}

const BLENDS: Record<string, number> = { normal: 0, multiply: 1, screen: 2, overlay: 3, darken: 4, lighten: 5 }

interface Program {
  program: WebGLProgram
  uniforms: Map<string, WebGLUniformLocation | null>
  settings: TransitionUniform[]
}

export class Compositor {
  readonly canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private w: number
  private h: number
  private layerProgram!: Program
  private blitProgram!: Program
  private transitions = new Map<string, Program | "failed">()
  private targets: Array<{ tex: WebGLTexture; fbo: WebGLFramebuffer }> = []
  private sources: WebGLTexture[] = []
  private vao: WebGLVertexArrayObject

  /** True when this window can run the compositor */
  static supported(): boolean {
    try {
      return Boolean(document.createElement("canvas").getContext("webgl2"))
    } catch {
      return false
    }
  }

  constructor(width: number, height: number, canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? document.createElement("canvas")
    this.canvas.width = this.w = Math.max(2, Math.round(width))
    this.canvas.height = this.h = Math.max(2, Math.round(height))
    const gl = this.canvas.getContext("webgl2", { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, alpha: false })
    if (!gl) throw new Error("This window cannot use the graphics card for the picture.")
    this.gl = gl
    this.vao = gl.createVertexArray()!
    this.layerProgram = this.build(VERTEX, LAYER_FRAGMENT, ["u_backdrop", "u_tex", "u_size", "u_src", "u_fit", "u_k", "u_pos", "u_rot", "u_flip", "u_crop", "u_alpha", "u_bright", "u_contrast", "u_sat", "u_blur", "u_blend", "u_time", "u_grade", "u_grade2", "u_split", "u_lens", "u_lens2", "u_leak"])
    this.blitProgram = this.build(VERTEX, BLIT_FRAGMENT, ["u_tex"])
    this.allocate()
  }

  get width() {
    return this.w
  }
  get height() {
    return this.h
  }

  resize(width: number, height: number) {
    const w = Math.max(2, Math.round(width))
    const h = Math.max(2, Math.round(height))
    if (w === this.w && h === this.h) return
    this.w = this.canvas.width = w
    this.h = this.canvas.height = h
    this.release()
    this.allocate()
  }

  dispose() {
    this.release()
    this.sources.forEach((t) => this.gl.deleteTexture(t))
    this.sources = []
    this.gl.getExtension("WEBGL_lose_context")?.loseContext()
  }

  // ---- setup

  private build(vertex: string, fragment: string, names: string[], settings: TransitionUniform[] = []): Program {
    const gl = this.gl
    const compile = (type: number, text: string) => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, text)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) ?? "unknown error"
        gl.deleteShader(shader)
        throw new Error(log)
      }
      return shader
    }
    const program = gl.createProgram()!
    const vs = compile(gl.VERTEX_SHADER, vertex)
    const fs = compile(gl.FRAGMENT_SHADER, fragment)
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link error")
    const uniforms = new Map<string, WebGLUniformLocation | null>()
    for (const n of [...names, ...settings.map((s) => s.name)]) uniforms.set(n, gl.getUniformLocation(program, n))
    return { program, uniforms, settings }
  }

  private texture(): WebGLTexture {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  /** Four screen-sized targets: two to alternate between while drawing layers, two for the clips of a transition */
  private allocate() {
    const gl = this.gl
    for (let i = 0; i < 4; i++) {
      const tex = this.texture()
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.w, this.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      const fbo = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      this.targets.push({ tex, fbo })
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private release() {
    for (const t of this.targets) {
      this.gl.deleteTexture(t.tex)
      this.gl.deleteFramebuffer(t.fbo)
    }
    this.targets = []
  }

  private transitionProgram(glsl: string): Program | null {
    const have = this.transitions.get(glsl)
    if (have === "failed") return null
    if (have) return have
    try {
      const read = readTransitionUniforms(glsl)
      if ("error" in read) throw new Error(read.error)
      // The shader declares its own settings in its text; the program only needs to find where they live
      const program = this.build(VERTEX, `${TRANSITION_PRELUDE}${glsl}${TRANSITION_MAIN}`, ["from", "to", "progress", "ratio"], read.uniforms)
      this.transitions.set(glsl, program)
      return program
    } catch {
      this.transitions.set(glsl, "failed")
      return null
    }
  }

  // ---- drawing

  private upload(index: number, source: TexImageSource): WebGLTexture {
    const gl = this.gl
    while (this.sources.length <= index) this.sources.push(this.texture())
    const tex = this.sources[index]!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    } catch {
      // a video that has no picture yet: the layer is left out of this frame
      return tex
    }
    return tex
  }

  private bindTex(unit: number, tex: WebGLTexture) {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit)
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex)
  }

  private draw(into: { fbo: WebGLFramebuffer } | null) {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, into ? into.fbo : null)
    gl.viewport(0, 0, this.w, this.h)
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  private clear(target: { fbo: WebGLFramebuffer }) {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    gl.viewport(0, 0, this.w, this.h)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  /** Draws one layer over `backdrop` into `out` */
  private layer(input: LayerInput, slot: number, backdrop: { tex: WebGLTexture }, out: { fbo: WebGLFramebuffer }) {
    const gl = this.gl
    const { program, uniforms } = this.layerProgram
    const tex = this.upload(slot, input.source)
    const fx = input.fx
    const k = (fx?.scale ?? 100) / 100
    const fit = Math.min(this.w / input.sw, this.h / input.sh) * k
    gl.useProgram(program)
    this.bindTex(0, backdrop.tex)
    this.bindTex(1, tex)
    gl.uniform1i(uniforms.get("u_backdrop") ?? null, 0)
    gl.uniform1i(uniforms.get("u_tex") ?? null, 1)
    gl.uniform2f(uniforms.get("u_size") ?? null, this.w, this.h)
    gl.uniform2f(uniforms.get("u_src") ?? null, input.sw, input.sh)
    gl.uniform1f(uniforms.get("u_fit") ?? null, fit)
    gl.uniform1f(uniforms.get("u_k") ?? null, k)
    gl.uniform2f(uniforms.get("u_pos") ?? null, ((fx?.x ?? 0) / 100) * this.w, ((fx?.y ?? 0) / 100) * this.h)
    gl.uniform1f(uniforms.get("u_rot") ?? null, ((fx?.rotation ?? 0) * Math.PI) / 180)
    gl.uniform2f(uniforms.get("u_flip") ?? null, fx?.flipH ? -1 : 1, fx?.flipV ? -1 : 1)
    gl.uniform4f(uniforms.get("u_crop") ?? null, (fx?.cropL ?? 0) / 100, (fx?.cropT ?? 0) / 100, (fx?.cropR ?? 0) / 100, (fx?.cropB ?? 0) / 100)
    gl.uniform1f(uniforms.get("u_alpha") ?? null, input.alpha)
    gl.uniform1f(uniforms.get("u_bright") ?? null, (fx?.brightness ?? 100) / 100)
    gl.uniform1f(uniforms.get("u_contrast") ?? null, (fx?.contrast ?? 100) / 100)
    gl.uniform1f(uniforms.get("u_sat") ?? null, (fx?.saturation ?? 100) / 100)
    // A blur of so many pixels at 1280 wide, grown with the picture; the soft disc reaches about twice that
    gl.uniform1f(uniforms.get("u_blur") ?? null, fx?.blur ? fx.blur * (this.w / 1280) * 2 : 0)
    gl.uniform1i(uniforms.get("u_blend") ?? null, BLENDS[fx?.blend ?? "normal"] ?? 0)
    gl.uniform1f(uniforms.get("u_time") ?? null, input.time ?? 0)
    const pct = (v: number | undefined) => (v ?? 0) / 100
    gl.uniform4f(uniforms.get("u_grade") ?? null, pct(fx?.temperature), pct(fx?.tint), pct(fx?.highlights), pct(fx?.shadows))
    gl.uniform4f(uniforms.get("u_grade2") ?? null, pct(fx?.vibrance), pct(fx?.fade), 0, 0)
    gl.uniform4f(uniforms.get("u_split") ?? null, (((fx?.shadowHue ?? 0) % 360) + 360) % 360 / 360, pct(fx?.shadowTone), (((fx?.highlightHue ?? 0) % 360) + 360) % 360 / 360, pct(fx?.highlightTone))
    gl.uniform4f(uniforms.get("u_lens") ?? null, pct(fx?.grain), pct(fx?.vignette), pct(fx?.bloom), pct(fx?.halation))
    gl.uniform4f(uniforms.get("u_lens2") ?? null, pct(fx?.chroma), pct(fx?.sharpen), pct(fx?.glitch), pct(fx?.scanlines))
    gl.uniform2f(uniforms.get("u_leak") ?? null, pct(fx?.leak), (((fx?.leakHue ?? 25) % 360) + 360) % 360 / 360)
    this.draw(out)
  }

  /** Draws the change from one finished picture to another, with the transition's own shader */
  private change(t: TransitionInput, from: { tex: WebGLTexture }, to: { tex: WebGLTexture }, out: { fbo: WebGLFramebuffer }): boolean {
    const prog = this.transitionProgram(t.glsl)
    if (!prog) return false
    const gl = this.gl
    gl.useProgram(prog.program)
    this.bindTex(0, from.tex)
    this.bindTex(1, to.tex)
    gl.uniform1i(prog.uniforms.get("from") ?? null, 0)
    gl.uniform1i(prog.uniforms.get("to") ?? null, 1)
    gl.uniform1f(prog.uniforms.get("progress") ?? null, Math.max(0, Math.min(1, t.progress)))
    gl.uniform1f(prog.uniforms.get("ratio") ?? null, this.w / this.h)
    for (const s of prog.settings) {
      const loc = prog.uniforms.get(s.name) ?? null
      const given = t.params?.[s.name]
      const v = given === undefined ? s.value : typeof given === "number" ? [given] : typeof given === "boolean" ? [given ? 1 : 0] : given
      if (s.type === "float") gl.uniform1f(loc, v[0] ?? 0)
      else if (s.type === "int" || s.type === "bool") gl.uniform1i(loc, Math.round(v[0] ?? 0))
      else if (s.type === "vec2") gl.uniform2f(loc, v[0] ?? 0, v[1] ?? 0)
      else if (s.type === "vec3") gl.uniform3f(loc, v[0] ?? 0, v[1] ?? 0, v[2] ?? 0)
      else gl.uniform4f(loc, v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0)
    }
    this.draw(out)
    return true
  }

  /** Draws one frame onto `canvas`. Returns false when a transition's shader would not run and a plain cross-fade was used instead. */
  render(frame: FrameInput): boolean {
    const [P0, P1, TA, TB] = this.targets as [(typeof this.targets)[number], (typeof this.targets)[number], (typeof this.targets)[number], (typeof this.targets)[number]]
    let result = P0
    let spare = P1
    const swap = () => {
      ;[result, spare] = [spare, result]
    }
    let exact = true
    this.clear(result)
    let slot = 0
    const { base, transition, overlays } = frame
    if (base.length >= 2 && transition) {
      const a = base[base.length - 2]!
      const b = base[base.length - 1]!
      this.clear(TA)
      this.clear(TB)
      this.layer(a, slot++, TA, TB) // reads TA's black, writes TB
      this.layer(b, slot++, TA, spare) // b over black into the spare target
      // From is a over black (in TB); to is b over black (in spare); the change is written into the result
      if (this.change(transition, TB, spare, result)) {
        // the result already holds the change
      } else {
        // The shader would not run: a plain cross-fade of the two
        exact = false
        this.clear(result)
        this.layer({ ...a }, slot++, result, spare)
        swap()
        this.layer({ ...b, alpha: b.alpha * transition.progress }, slot++, result, spare)
        swap()
      }
    } else {
      for (const l of base.slice(-1)) {
        this.layer(l, slot++, result, spare)
        swap()
      }
    }
    for (const l of overlays) {
      this.layer(l, slot++, result, spare)
      swap()
    }
    // Copy the result to the canvas
    const gl = this.gl
    gl.useProgram(this.blitProgram.program)
    this.bindTex(0, result.tex)
    gl.uniform1i(this.blitProgram.uniforms.get("u_tex") ?? null, 0)
    this.draw(null)
    return exact
  }

  /** One pixel of what was last drawn, for checks: x from the left, y from the top, as 0 to 255 */
  readPixel(x: number, y: number): [number, number, number] {
    const gl = this.gl
    const out = new Uint8Array(4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.readPixels(x, this.h - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out)
    return [out[0]!, out[1]!, out[2]!]
  }
}
