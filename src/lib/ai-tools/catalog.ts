import type { ToolOption, ToolSpec } from "./types"

/**
 * The AI tools, once. Names are the ones the industry uses. A tool appears in a place only when something can run it (see match.ts).
 * Order here is the order people see.
 */

const aspect: ToolOption = { id: "aspect", label: "Shape", type: "choice", keys: ["aspect_ratio"], choices: [{ value: "9:16", label: "Vertical 9:16" }, { value: "1:1", label: "Square 1:1" }, { value: "4:5", label: "Portrait 4:5" }, { value: "16:9", label: "Wide 16:9" }], default: "9:16" }
const factor: ToolOption = { id: "factor", label: "Scale", type: "choice", keys: ["upscale_factor", "scale", "factor"], choices: [{ value: 2, label: "2x" }, { value: 4, label: "4x" }], default: 2 }
const voice: ToolOption = { id: "voice", label: "Voice", type: "text", keys: ["voice", "voice_id", "voice_name"], hint: "A voice name the model knows. Leave empty for its default." }
const seconds: ToolOption = { id: "seconds", label: "Length (seconds)", type: "number", keys: ["duration", "duration_seconds", "seconds", "length"], min: 1, max: 120, step: 1, default: 15 }

const model = (spec: Omit<ToolSpec, "kind">): ToolSpec => ({ ...spec, kind: "model" })

export const CATALOG: ToolSpec[] = [
  // ------------------------------------------------------------------ cut tools: act on the whole cut in Story/Edit, nothing to buy
  { id: "cut-assemble", name: "Assemble", group: "video", kind: "cut", hint: "Puts every beat of the story on the timeline, in order.", output: "video", automation: "Bring the cut in line with the story's beats so every beat has a clip, in story order." },
  { id: "cut-silence", name: "Remove silence", also: ["Silence remover", "Jump cut"], group: "audio", kind: "cut", hint: "Cuts the quiet gaps out of speech.", output: "video", featured: 2, automation: "Find the speech in the cut (a video clip with speech or a speech sound) and remove its silent stretches, closing the gaps." },
  { id: "cut-scenes", name: "Find scenes", also: ["Scene detection", "Shot detection"], group: "video", kind: "cut", hint: "Splits each clip where the shot changes.", output: "video", automation: "For every video clip on the main track, split it where the shot changes." },
  { id: "cut-beats", name: "Beat sync", also: ["Cut to the beat"], group: "audio", kind: "cut", hint: "Lands the cuts on the beat of the music.", output: "video", automation: "Find the first music sound in the cut and change the clip lengths so the cuts land on its beats. If there is no sound, say so." },
  { id: "cut-duck", name: "Auto ducking", also: ["Music ducking"], group: "audio", kind: "cut", hint: "Turns the music down while someone speaks.", output: "audio", automation: "Find the music sound and the speech sound in the cut and turn the music down while the speech is spoken. If there is no music or no speech, say so." },
  { id: "cut-fit", name: "Fit length", group: "video", kind: "cut", hint: "Tightens the cut to a length you choose.", output: "video", automation: "Make the whole cut about 15 percent shorter by scaling the clips." },
  { id: "cut-match", name: "Match color", also: ["Color match", "Auto color"], group: "video", kind: "cut", hint: "Gives every clip the colour of the first one.", output: "video", automation: "Match the brightness and colour of every clip to clip 1." },
  { id: "cut-vertical", name: "Vertical 9:16", also: ["Reframe", "Auto reframe"], group: "video", kind: "cut", hint: "Changes the picture shape for phones.", output: "video", featured: 3, automation: "Change the picture shape to 9:16 for phones." },
  { id: "cut-fades", name: "Fades", group: "video", kind: "cut", hint: "Half a second fade at both ends of every clip.", output: "video", automation: "Give every clip on the main track a half second fade in and a half second fade out." },
  { id: "cut-captions-script", name: "Script captions", group: "video", kind: "cut", hint: "One caption for every spoken line of the script.", output: "video", automation: "Add a caption for every spoken line of the script, replacing the captions that are there. Tell me the timing is a first pass." },
  { id: "cut-captions-speech", name: "Speech captions", also: ["Auto captions", "Speech to text"], group: "audio", kind: "cut", hint: "Writes what is said and adds it as captions.", output: "video", automation: "Find the first sound in the cut that holds speech, write down what is said and add it as captions, replacing the captions that are there. If there is no sound, say so." },
  { id: "cut-empty", name: "Drop empty beats", group: "video", kind: "cut", hint: "Drops clips that have no picture yet.", output: "video", automation: "Remove the clips whose beat has no picture or video made yet, and close the gaps." },
  { id: "cut-look", name: "Same look", group: "video", kind: "cut", hint: "The same contrast and colour on every clip.", output: "video", automation: "Give every clip the same look: slightly higher contrast (110) and saturation (110). Do not change anything else." },
  { id: "cut-markers", name: "Mark cuts", group: "video", kind: "cut", hint: "Puts a marker at each clip.", output: "video", automation: "Put a marker at the start of every clip on the main track, labelled with the clip number." },

  // ------------------------------------------------------------------ audio, through a model
  model({ id: "audio-voice-isolation", name: "Voice isolation", also: ["Vocal remover", "Isolate voice"], group: "audio", hint: "Keeps the voice and drops everything else.", output: "audio", featured: 5 }),
  model({ id: "audio-noise-reduction", name: "Noise reduction", also: ["Remove background noise", "Denoise audio", "Enhance speech", "Studio sound"], group: "audio", hint: "Cleans hiss, hum and room noise.", output: "audio" }),
  model({ id: "audio-stems", name: "Stem splitter", also: ["Separate stems", "Demucs"], group: "audio", hint: "Splits a song into vocals, drums, bass and the rest.", output: "audio" }),
  model({ id: "audio-voice-changer", name: "Voice changer", group: "audio", hint: "Says the same words in a different voice.", output: "audio", options: [voice] }),
  { id: "audio-text-to-speech", name: "Voiceover", also: ["Voiceover", "TTS"], group: "audio", kind: "model", hint: "Writes a voice track from text.", output: "audio", prompt: { label: "What to say", placeholder: "Type the words", required: true }, options: [voice], viaAudioTask: "speech" },
  { id: "audio-text-to-music", name: "Music", also: ["Music generation", "Add music"], group: "audio", kind: "model", hint: "Makes music from a description.", output: "audio", featured: 4, prompt: { label: "Describe the music", placeholder: "Calm piano, slow, hopeful", required: true }, options: [seconds], viaAudioTask: "music" },
  { id: "audio-text-to-sfx", name: "Sound effects", also: ["Sound effects", "SFX", "Foley"], group: "audio", kind: "model", hint: "Makes a sound effect from a description.", output: "audio", prompt: { label: "Describe the sound", placeholder: "Door creaking open", required: true }, options: [seconds], viaAudioTask: "sfx" },

  // ------------------------------------------------------------------ video, through a model
  model({ id: "video-remove-background", name: "Remove background", also: ["Green screen", "Background removal", "Matting"], group: "video", hint: "Cuts the person or object out of the clip.", output: "video", featured: 1 }),
  model({ id: "video-remove-object", name: "Remove object", also: ["Inpainting", "Erase"], group: "video", hint: "Erases something from the picture.", output: "video", prompt: { label: "What to remove", placeholder: "The person on the left", required: true } }),
  model({ id: "video-upscale", name: "Upscale", also: ["Super resolution", "Enhance", "Increase resolution"], group: "video", hint: "More pixels and detail.", output: "video", featured: 6, options: [factor] }),
  model({ id: "video-slow-motion", name: "Slow motion", also: ["Frame interpolation", "Frame rate boost"], group: "video", hint: "Adds frames so motion is smooth or slow.", output: "video", options: [{ id: "multiplier", label: "Frames", type: "choice", keys: ["slowdown_factor", "multiplier", "interpolation_factor"], choices: [{ value: 2, label: "2x" }, { value: 4, label: "4x" }], default: 2 }, { id: "fps", label: "Frame rate", type: "choice", keys: ["target_fps", "fps", "output_fps"], choices: [{ value: 30, label: "30 fps" }, { value: 60, label: "60 fps" }], default: 60 }] }),
  model({ id: "video-denoise", name: "Denoise", also: ["Deblur", "Restore video"], group: "video", hint: "Removes grain, noise and blur.", output: "video" }),
  model({ id: "video-colorize", name: "Colorize", group: "video", hint: "Adds colour to black and white footage.", output: "video" }),
  model({ id: "video-relight", name: "Relight", group: "video", hint: "Changes the light on the scene.", output: "video", prompt: { label: "The light you want", placeholder: "Warm sunset from the left", required: false } }),
  model({ id: "video-restyle", name: "Restyle", also: ["Video to video", "Style transfer"], group: "video", hint: "Repaints the clip in another look.", output: "video", prompt: { label: "The style", placeholder: "Watercolour painting", required: true } }),
  model({ id: "video-reframe", name: "Reframe", also: ["Auto reframe", "Smart crop"], group: "video", hint: "Makes the clip another shape by extending the picture.", output: "video", options: [aspect] }),
  model({ id: "video-dub", name: "AI dubbing", also: ["Translate video", "Dubbing"], group: "video", hint: "The speaker says it in another language, lips in sync.", output: "video", options: [{ id: "language", label: "Language", type: "choice", keys: ["output_language", "target_language", "language", "dubbed_language"], fromSchema: true }] }),
  model({ id: "video-remove-fillers", name: "Remove fillers", also: ["Um and uh remover"], group: "video", hint: "Cuts out the ums and uhs.", output: "video" }),
  model({ id: "video-sound-effects", name: "Auto sound FX", also: ["Auto foley"], group: "video", hint: "Adds sound effects that fit what happens.", output: "video", prompt: { label: "What to add (optional)", placeholder: "Footsteps, rain", required: false } }),
  model({ id: "video-music", name: "Auto score", also: ["Score"], group: "video", hint: "Writes music that fits the clip.", output: "video" }),
  { id: "video-extend", name: "Extend video", also: ["Generative extend"], group: "video", kind: "model", hint: "Continues a clip.", output: "video", prompt: { label: "What happens next", placeholder: "The camera pans to the sea", required: false }, viaEditAction: "extend" },
  { id: "video-lip-sync", name: "Lip-sync", group: "video", kind: "model", hint: "Makes a face say a voice.", output: "video", needs: [{ kind: "audio", label: "Voice", required: true }], viaEditAction: "lip-sync" },
  { id: "video-motion-transfer", name: "Motion transfer", group: "video", kind: "model", hint: "A picture moves the way a clip does.", output: "video", needs: [{ kind: "image", label: "Picture", required: true }], viaEditAction: "motion-transfer" },
  { id: "video-edit", name: "Edit by prompt", also: ["Prompt edit"], group: "video", kind: "model", hint: "Changes the clip from a sentence.", output: "video", prompt: { label: "What to change", placeholder: "Make the car red", required: true }, viaEditAction: "edit" },

  // ------------------------------------------------------------------ image, through a model (not shown in Story/Edit)
  model({ id: "image-remove-background", name: "Remove background", also: ["Background removal", "Cutout"], group: "image", hint: "Cuts the subject out on transparent.", output: "image", featured: 1 }),
  model({ id: "image-upscale", name: "Upscale", also: ["Super resolution", "Enhance"], group: "image", hint: "More pixels and detail.", output: "image", options: [factor] }),
  model({ id: "image-restore", name: "Restore", also: ["Face restore", "Denoise"], group: "image", hint: "Repairs old, noisy or soft pictures.", output: "image" }),
  model({ id: "image-remove-object", name: "Remove object", also: ["Inpainting", "Erase"], group: "image", hint: "Erases something from the picture.", output: "image", prompt: { label: "What to remove", placeholder: "The sign on the wall", required: true }, instruction: "Remove this from the picture and fill the space so it looks natural. Change nothing else: {prompt}" }),
  model({ id: "image-relight", name: "Relight", group: "image", hint: "Changes the light.", output: "image", prompt: { label: "The light you want", placeholder: "Warm sunset from the left", required: false }, instruction: "Change only the lighting of this picture: {prompt}. Keep the people, objects and layout exactly as they are." }),
  model({ id: "image-restyle", name: "Restyle", also: ["Style transfer"], group: "image", hint: "Repaints the picture in another look.", output: "image", prompt: { label: "The style", placeholder: "Oil painting", required: true }, instruction: "Redraw this picture in this style, keeping the same people, objects and layout: {prompt}" }),
  model({ id: "image-outpaint", name: "Generative fill", also: ["Outpaint", "Expand"], group: "image", hint: "Extends the picture past its edges.", output: "image", options: [{ ...aspect, default: "16:9" }], instruction: "Extend this picture past its edges so it fills a wider frame. Continue the scene naturally and keep the original part unchanged." }),
]

export const toolById = (id: string): ToolSpec | undefined => CATALOG.find((t) => t.id === id)
