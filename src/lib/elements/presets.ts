import type { StyleCategory } from "./types"

/**
 * Ready-made style elements, so a user who does not know the words for a lens or a light can still pick one.
 * Each is a short phrase that models understand; they are added after the user's own request.
 */
export interface Preset {
  id: string
  category: StyleCategory
  name: string
  text: string
}

export const PRESETS: Preset[] = [
  // camera
  { id: "camera-dolly-in", category: "camera", name: "Slow dolly in", text: "slow dolly-in toward the subject, steady and smooth" },
  { id: "camera-orbit", category: "camera", name: "Orbit", text: "camera orbits around the subject in a smooth arc" },
  { id: "camera-handheld", category: "camera", name: "Handheld", text: "handheld camera with subtle natural shake, documentary feel" },
  { id: "camera-crane", category: "camera", name: "Crane up", text: "crane shot rising up and away to reveal the whole scene" },
  { id: "camera-low-angle", category: "camera", name: "Low angle", text: "low-angle shot looking up at the subject, heroic framing" },
  { id: "camera-macro", category: "camera", name: "Macro close-up", text: "extreme macro close-up, shallow depth of field, fine detail" },
  { id: "camera-wide", category: "camera", name: "Wide establishing", text: "wide establishing shot with deep focus, subject small in the frame" },
  // light
  { id: "light-golden-hour", category: "light", name: "Golden hour", text: "warm golden hour sunlight, long soft shadows, gentle rim light" },
  { id: "light-soft-window", category: "light", name: "Soft window light", text: "soft diffused window light from the side, gentle falloff" },
  { id: "light-neon", category: "light", name: "Neon night", text: "night scene lit by neon signs, colored reflections on wet surfaces" },
  { id: "light-studio", category: "light", name: "Studio softbox", text: "clean studio lighting with large softbox, even exposure, soft shadows" },
  { id: "light-overcast", category: "light", name: "Overcast", text: "flat overcast daylight, muted colors, no harsh shadows" },
  { id: "light-candle", category: "light", name: "Candlelight", text: "warm flickering candlelight, deep shadows, intimate mood" },
  { id: "light-backlit", category: "light", name: "Backlit silhouette", text: "strong backlight, glowing edges, subject partly in silhouette" },
  // style
  { id: "style-cinematic", category: "style", name: "Cinematic film", text: "cinematic film still, anamorphic lens, subtle film grain, graded colors" },
  { id: "style-photoreal", category: "style", name: "Photorealistic", text: "photorealistic, natural skin and material texture, true-to-life colors" },
  { id: "style-anime", category: "style", name: "Anime", text: "anime style, clean line art, flat cel shading, vivid colors" },
  { id: "style-watercolor", category: "style", name: "Watercolor", text: "watercolor painting, soft bleeding edges, visible paper texture" },
  { id: "style-3d", category: "style", name: "3D render", text: "polished 3D render, smooth materials, global illumination" },
  { id: "style-vintage", category: "style", name: "Vintage film", text: "vintage 35mm film look, faded colors, light leaks, soft grain" },
  // effects
  { id: "fx-slow-motion", category: "effects", name: "Slow motion", text: "slow motion, fine detail in every movement" },
  { id: "fx-particles", category: "effects", name: "Floating particles", text: "fine particles and dust drifting through the air, catching the light" },
  { id: "fx-fog", category: "effects", name: "Fog and haze", text: "atmospheric fog and haze, volumetric light beams" },
  { id: "fx-rain", category: "effects", name: "Rain", text: "falling rain, wet surfaces, droplets and ripples" },
  { id: "fx-lens-flare", category: "effects", name: "Lens flare", text: "anamorphic lens flare streaking across the frame" },
  { id: "fx-glitch", category: "effects", name: "Glitch", text: "digital glitch and chromatic aberration flickers" },
]
