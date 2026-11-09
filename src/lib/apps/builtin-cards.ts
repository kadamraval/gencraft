/**
 * The built-in app cards on the Apps page, by category. A card opens one of the app's two editors (Image Edit, Video Edit), one Edit option
 * already chosen, a recipe app, or is marked Soon until what goes inside it is decided. Create is not a card: the composer makes pictures,
 * clips and sound. Whether a card can run is decided by the person's models (the one capability rule), never here.
 */

export type CardCategory = "image" | "video" | "audio" | "text"

export type CardOpens =
  /** The Edit app for this kind of file; with `tool`, that Edit option is already chosen */
  | { kind: "edit"; media: "image" | "video" | "audio"; tool?: string }
  /** Create, in this mode (music and sound are made from words, like any Create) */
  | { kind: "create"; mode: "image" | "video" | "audio" }
  /** The timeline editor on its own page */
  | { kind: "video-edit" }
  /** A recipe app from system-apps.ts */
  | { kind: "app"; appId: string }
  /** Not built yet */
  | { kind: "soon" }

export interface BuiltinCard {
  id: string
  category: CardCategory
  name: string
  hint: string
  opens: CardOpens
}

const soon = { kind: "soon" } as const

export const BUILTIN_CARDS: BuiltinCard[] = [
  // Image
  { id: "image-edit", category: "image", name: "Image Edit", hint: "Edit and change a picture you have", opens: { kind: "edit", media: "image" } },
  { id: "image-variations", category: "image", name: "Variations", hint: "More versions of a picture", opens: soon },
  { id: "image-change-camera", category: "image", name: "Change Camera", hint: "A new camera angle and lens", opens: soon },
  { id: "image-relight", category: "image", name: "Relight", hint: "Change the light and mood", opens: { kind: "edit", media: "image", tool: "image-relight" } },
  { id: "image-remove-background", category: "image", name: "Remove Background", hint: "Cut the subject out", opens: { kind: "edit", media: "image", tool: "image-remove-background" } },
  { id: "image-skin-enhancer", category: "image", name: "Skin Enhancer", hint: "Retouch skin, keep it real", opens: soon },
  { id: "image-mockup", category: "image", name: "Mockup Generator", hint: "Put a design on a product", opens: soon },
  { id: "image-cinematic-shot", category: "image", name: "Cinematic Shot", hint: "A frame that looks like a film", opens: soon },
  { id: "image-outfit-swap", category: "image", name: "Outfit Swap", hint: "Dress someone in new clothes", opens: soon },
  { id: "image-face-swap", category: "image", name: "Face Swap", hint: "Put a face on another picture", opens: soon },
  { id: "image-product-photo", category: "image", name: "Product Photo", hint: "A studio photo of your product", opens: { kind: "app", appId: "sys_product_photo" } },
  { id: "image-architect-render", category: "image", name: "Architect Render", hint: "A 3D render from a plan or sketch", opens: { kind: "app", appId: "sys_architect_render" } },
  // Video
  { id: "video-edit", category: "video", name: "Video Edit", hint: "Cut, trim and finish clips on a timeline", opens: { kind: "video-edit" } },
  { id: "video-modify", category: "video", name: "Modify Video", hint: "Change a clip by saying what to change", opens: { kind: "edit", media: "video", tool: "video-edit" } },
  { id: "video-speak", category: "video", name: "Speak", hint: "Make a face say a voice", opens: { kind: "edit", media: "video", tool: "video-lip-sync" } },
  { id: "video-relight", category: "video", name: "Video Relight", hint: "Change the light of a clip", opens: { kind: "edit", media: "video", tool: "video-relight" } },
  { id: "video-cinematic", category: "video", name: "Cinematic Video", hint: "Shots that look like a film", opens: soon },
  { id: "video-face-swap", category: "video", name: "Face Swap", hint: "Put a face on someone in a clip", opens: soon },
  // Audio
  { id: "audio-music", category: "audio", name: "Music Generator", hint: "Music from a description", opens: { kind: "create", mode: "audio" } },
  { id: "audio-generator", category: "audio", name: "Audio Generator", hint: "Any sound from a description", opens: soon },
  { id: "audio-sfx", category: "audio", name: "Sound Effect Generator", hint: "A sound effect from a description", opens: { kind: "create", mode: "audio" } },
  { id: "audio-voice-changer", category: "audio", name: "Voice Changer", hint: "The same words in another voice", opens: { kind: "edit", media: "audio", tool: "audio-voice-changer" } },
  { id: "audio-isolation", category: "audio", name: "Audio Isolation", hint: "Keep the voice, drop the noise", opens: { kind: "edit", media: "audio", tool: "audio-voice-isolation" } },
  // Text
  { id: "text-pdf-summary", category: "text", name: "PDF Summary", hint: "A clear summary of a PDF", opens: { kind: "app", appId: "sys_pdf_summary" } },
  { id: "text-social-posts", category: "text", name: "Social Post Writer", hint: "Posts for your channels", opens: { kind: "app", appId: "sys_social_posts" } },
  { id: "text-script-writer", category: "text", name: "Script Writer", hint: "A script for your video", opens: soon },
]
