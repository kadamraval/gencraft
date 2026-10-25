/**
 * What a transition's shader text may be, and how its settings are read. The app checks it before compiling and the publishing script
 * checks it before signing, so a bad shader never gets as far as the graphics card.
 */

export type UniformType = "float" | "int" | "bool" | "vec2" | "vec3" | "vec4"
export interface TransitionUniform {
  name: string
  type: UniformType
  value: number[]
}

/**
 * The settings a transition declares as `uniform float amount; // = 0.5`, with their defaults. Anything else it declares (the built-in
 * ones above) is not a setting. Returns an error text when the shader asks for something that is not allowed.
 */
export function readTransitionUniforms(source: string): { uniforms: TransitionUniform[] } | { error: string } {
  if (/#version|#extension|\bgl_FragCoord\b|\bdiscard\b/.test(source)) return { error: "a transition may not set a version or extension" }
  if (!/vec4\s+transition\s*\(\s*vec2\s+\w+\s*\)/.test(source)) return { error: "a transition must define vec4 transition(vec2 uv)" }
  const uniforms: TransitionUniform[] = []
  const re = /uniform\s+(float|int|bool|vec2|vec3|vec4)\s+(\w+)\s*;\s*(?:\/\/\s*=\s*([^\n]+))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    const type = m[1] as UniformType
    const name = m[2]!
    if (["from", "to", "progress", "ratio"].includes(name)) return { error: `"${name}" is already provided` }
    const count = type === "vec2" ? 2 : type === "vec3" ? 3 : type === "vec4" ? 4 : 1
    const raw = (m[3] ?? "").replace(/[a-z][a-z0-9]*\s*\(|\)/gi, "").split(",").map((x) => Number(x.trim() === "true" ? 1 : x.trim() === "false" ? 0 : x.trim()))
    const value = Array.from({ length: count }, (_, i) => (Number.isFinite(raw[i]) ? raw[i]! : 0))
    uniforms.push({ name, type, value })
  }
  return { uniforms }
}
