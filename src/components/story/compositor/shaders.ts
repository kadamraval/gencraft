/**
 * The shaders of the compositor. One draws a picture or a video frame onto what is already there, with its position, turn, flip,
 * crop, colour, blur, fade and blend; one draws the change between two clips from a transition's own shader text; one copies the
 * result to the screen. All three use a single triangle that covers the screen.
 */

export const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

/** Draws one layer over the backdrop. Screen pixels run left to right and top to bottom from the middle, like the 2D canvas the export used. */
export const LAYER_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D u_backdrop;
uniform sampler2D u_tex;
uniform vec2 u_size;      // output size in pixels
uniform vec2 u_src;       // source size in pixels
uniform float u_fit;      // pixels on screen per source pixel, with the scale in it
uniform float u_k;        // the scale on its own (crop is cut in the scaled frame)
uniform vec2 u_pos;       // offset from the middle, pixels, y down
uniform float u_rot;      // radians
uniform vec2 u_flip;      // 1 or -1
uniform vec4 u_crop;      // left, top, right, bottom as 0..1 of the frame
uniform float u_alpha;
uniform float u_bright;
uniform float u_contrast;
uniform float u_sat;
uniform float u_blur;     // radius of the blur in pixels of the output
uniform int u_blend;      // 0 normal, 1 multiply, 2 screen, 3 overlay, 4 darken, 5 lighten
uniform float u_time;     // seconds into the clip, for grain, glitch and leaks
uniform vec4 u_grade;     // temperature, tint, highlights, shadows (each -1..1)
uniform vec4 u_grade2;    // vibrance (-1..1), fade (0..1), 0, 0
uniform vec4 u_split;     // shadow hue (0..1), shadow amount, highlight hue (0..1), highlight amount
uniform vec4 u_lens;      // grain, vignette, bloom, halation (each 0..1)
uniform vec4 u_lens2;     // chroma, sharpen, glitch, scanlines (each 0..1)
uniform vec2 u_leak;      // amount (0..1), hue (0..1)

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

vec3 hue2rgb(float h) {
  return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}

vec3 blendOf(vec3 b, vec3 s, int mode) {
  if (mode == 1) return b * s;
  if (mode == 2) return 1.0 - (1.0 - b) * (1.0 - s);
  if (mode == 3) return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
  if (mode == 4) return min(b, s);
  if (mode == 5) return max(b, s);
  return s;
}

void main() {
  vec3 backdrop = texture(u_backdrop, vUv).rgb;
  vec2 s = (vec2(vUv.x, 1.0 - vUv.y) - 0.5) * u_size - u_pos;
  float c = cos(u_rot);
  float sn = sin(u_rot);
  vec2 q = vec2(c * s.x + sn * s.y, -sn * s.x + c * s.y) * u_flip;
  vec2 cmin = (-u_size * 0.5 + u_crop.xy * u_size) * u_k;
  vec2 cmax = (u_size * 0.5 - u_crop.zw * u_size) * u_k;
  vec2 uv = q / (u_src * u_fit) + 0.5;
  bool inside = q.x >= cmin.x && q.y >= cmin.y && q.x <= cmax.x && q.y <= cmax.y && uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
  if (!inside) {
    outColor = vec4(backdrop, 1.0);
    return;
  }
  uv.y = 1.0 - uv.y;

  float grain = u_lens.x;
  float vig = u_lens.y;
  float bloom = u_lens.z;
  float halo = u_lens.w;
  float chroma = u_lens2.x;
  float sharp = u_lens2.y;
  float glitch = u_lens2.z;
  float scan = u_lens2.w;

  // Glitch: bands of the picture jump sideways, now and then
  if (glitch > 0.0) {
    float band = floor(uv.y * 28.0);
    float tick = floor(u_time * 11.0);
    if (hash(vec2(band, tick)) > 1.0 - glitch * 0.3) uv.x += (hash(vec2(band, tick + 7.0)) - 0.5) * 0.14 * glitch;
  }

  vec4 col;
  if (u_blur > 0.0) {
    vec2 r = vec2(u_blur) / (u_src * u_fit);
    vec4 sum = vec4(0.0);
    for (int i = 0; i < 16; i++) {
      float a = float(i) * 2.39996323;
      float rr = sqrt((float(i) + 0.5) / 16.0);
      sum += texture(u_tex, uv + vec2(cos(a), sin(a)) * rr * r);
    }
    col = sum / 16.0;
  } else if (chroma > 0.0 || glitch > 0.0) {
    // Colour fringes: red and blue are read a little apart, more towards the edges
    vec2 dir = (uv - 0.5) * (chroma * 0.03 + glitch * 0.006);
    col = vec4(texture(u_tex, uv + dir).r, texture(u_tex, uv).g, texture(u_tex, uv - dir).b, texture(u_tex, uv).a);
  } else {
    col = texture(u_tex, uv);
  }

  vec3 rgb = col.rgb;

  // Glow from the bright parts: bloom is white, halation is the warm red halo of film
  if (bloom > 0.0 || halo > 0.0) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 2.39996323;
      float rr = sqrt((float(i) + 0.5) / 12.0);
      vec3 t = texture(u_tex, uv + vec2(cos(a), sin(a)) * rr * 0.045).rgb;
      acc += max(t - 0.55, 0.0);
    }
    acc /= 12.0;
    rgb += acc * bloom * 2.6;
    rgb += vec3(1.0, 0.32, 0.08) * dot(acc, vec3(0.333)) * halo * 3.2;
  }

  // Sharpen: push each pixel away from the average of its neighbours
  if (sharp > 0.0) {
    vec2 px = 1.0 / u_src;
    vec3 n = texture(u_tex, uv + vec2(px.x, 0.0)).rgb + texture(u_tex, uv - vec2(px.x, 0.0)).rgb + texture(u_tex, uv + vec2(0.0, px.y)).rgb + texture(u_tex, uv - vec2(0.0, px.y)).rgb;
    rgb += (rgb - n * 0.25) * sharp * 1.6;
  }

  rgb *= u_bright;
  rgb = (rgb - 0.5) * u_contrast + 0.5;
  float lum = dot(rgb, vec3(0.213, 0.715, 0.072));
  rgb = mix(vec3(lum), rgb, u_sat);

  // Colour grade
  rgb *= vec3(1.0 + u_grade.x * 0.22, 1.0, 1.0 - u_grade.x * 0.22);
  rgb.g *= 1.0 - u_grade.y * 0.18;
  rgb.rb *= 1.0 + u_grade.y * 0.09;
  float l = dot(rgb, vec3(0.213, 0.715, 0.072));
  rgb += u_grade.w * 0.22 * (1.0 - smoothstep(0.0, 0.55, l));
  rgb += u_grade.z * 0.22 * smoothstep(0.45, 1.0, l);
  float mx = max(rgb.r, max(rgb.g, rgb.b));
  float mn = min(rgb.r, min(rgb.g, rgb.b));
  rgb = mix(vec3(l), rgb, 1.0 + u_grade2.x * (1.0 - (mx - mn)));
  rgb = rgb * (1.0 - 0.3 * u_grade2.y) + 0.13 * u_grade2.y;
  if (u_split.y > 0.0 || u_split.w > 0.0) {
    float ll = dot(rgb, vec3(0.213, 0.715, 0.072));
    rgb += (hue2rgb(u_split.x) - 0.5) * u_split.y * 0.45 * (1.0 - smoothstep(0.0, 0.6, ll));
    rgb += (hue2rgb(u_split.z) - 0.5) * u_split.w * 0.45 * smoothstep(0.35, 1.0, ll);
  }

  // Light leak: two soft coloured blobs that drift, added like a screen
  if (u_leak.x > 0.0) {
    float t = u_time * 0.35;
    vec2 p = vec2(vUv.x, 1.0 - vUv.y);
    float b1 = smoothstep(0.85, 0.0, distance(p, vec2(0.08 + 0.18 * sin(t), 0.3 + 0.2 * cos(t * 0.7))));
    float b2 = smoothstep(0.7, 0.0, distance(p, vec2(0.95 - 0.12 * cos(t * 0.8), 0.75 + 0.15 * sin(t * 0.6))));
    vec3 leakCol = mix(hue2rgb(u_leak.y), vec3(1.0, 0.85, 0.5), 0.35);
    vec3 add = leakCol * (b1 + 0.7 * b2) * u_leak.x * 1.1;
    rgb = 1.0 - (1.0 - rgb) * (1.0 - clamp(add, 0.0, 1.0));
  }

  // Darkened corners, scan lines and grain come last
  if (vig > 0.0) {
    float d = length((vec2(vUv.x, 1.0 - vUv.y) - 0.5) * vec2(u_size.x / u_size.y, 1.0));
    rgb *= 1.0 - vig * smoothstep(0.3, 0.95, d);
  }
  if (scan > 0.0) rgb *= 1.0 - scan * 0.28 * step(0.5, fract(gl_FragCoord.y * 0.5));
  if (grain > 0.0) {
    float n = hash(gl_FragCoord.xy + fract(u_time * 7.13) * 91.7) - 0.5;
    float lg = dot(rgb, vec3(0.333));
    rgb += n * grain * 0.5 * (1.0 - abs(lg - 0.5) * 1.2);
  }

  rgb = clamp(rgb, 0.0, 1.0);
  float a = clamp(u_alpha * col.a, 0.0, 1.0);
  outColor = vec4(mix(backdrop, blendOf(backdrop, rgb, u_blend), a), 1.0);
}
`

export const BLIT_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D u_tex;
void main() { outColor = vec4(texture(u_tex, vUv).rgb, 1.0); }
`

/** Everything a transition's own text can use. The text defines `vec4 transition(vec2 uv)` and may call getFromColor and getToColor. */
export const TRANSITION_PRELUDE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D from;
uniform sampler2D to;
uniform float progress;
uniform float ratio;
vec4 getFromColor(vec2 uv) { return texture(from, uv); }
vec4 getToColor(vec2 uv) { return texture(to, uv); }
`

export const TRANSITION_MAIN = `
void main() { outColor = vec4(transition(vUv).rgb, 1.0); }
`

export { readTransitionUniforms } from "@/lib/packs/glsl"
export type { TransitionUniform, UniformType } from "@/lib/packs/glsl"
