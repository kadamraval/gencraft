import type { ParamProperty } from "./types"

/**
 * Providers name the same switch differently. The composer, the price rules and the picker all ask for the
 * canonical meaning here instead of guessing a field name.
 */
export const AUDIO_SWITCH_KEYS = ["generate_audio", "audio", "enable_audio", "with_audio", "audio_enabled", "generateaudio", "generate_audio_switch"] as const

/** The on/off field that makes a video model produce sound, if the model has one. */
export function audioSwitchKey(props: Record<string, ParamProperty>): string | undefined {
  return AUDIO_SWITCH_KEYS.find((k) => props[k] && !props[k]!.format && (props[k]!.type === "boolean" || props[k]!.enum?.length === 2))
}
