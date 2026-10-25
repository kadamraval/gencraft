import { FolderPlus, Film, Layers, Mic, Music, PenLine, SlidersHorizontal, Sparkles, Target, Upload, Wallet, WandSparkles } from "lucide-react"
import type { BlankStateProps } from "@/components/ui/blank-state"

/** The words for each Create page's blank state. The look is the shared BlankState. */
export const MODE_INTRO: Record<"image" | "video" | "audio", Omit<BlankStateProps, "action" | "compact">> = {
  image: {
    art: { image: "01_image.png" },
    title: "Image",
    line: "Turn a description into pictures.",
    steps: [
      { icon: PenLine, title: "Describe it", text: "Write what you see. @ brings in a character or place, / applies a skill." },
      { icon: SlidersHorizontal, title: "Pick a model", text: "Models that take reference images show a Reference slot." },
      { icon: WandSparkles, title: "Generate", text: "Results land here and in your Library. A failed one has a Log." },
    ],
  },
  video: {
    art: { image: "02_video.png" },
    title: "Video",
    line: "Turn a description or a picture into a clip.",
    steps: [
      { icon: PenLine, title: "Describe the motion", text: "Say what happens. A start frame turns a picture into a clip." },
      { icon: SlidersHorizontal, title: "Pick a model", text: "Length, sound and ratio come from the model you choose." },
      { icon: Film, title: "Generate", text: "Clips land here and in your Library. A failed one has a Log." },
    ],
  },
  audio: {
    art: { image: "03_audio.png" },
    title: "Audio",
    line: "Make speech, music or sound from words.",
    steps: [
      { icon: Mic, title: "Write it", text: "Type the line to speak, or describe the music or sound." },
      { icon: SlidersHorizontal, title: "Pick a model", text: "Voice, language and length come from the model you choose." },
      { icon: Music, title: "Generate", text: "Audio lands here and in your Library. A failed one has a Log." },
    ],
  },
}

/** The Library's blank state: what lands there and how to keep it tidy. */
export const LIBRARY_INTRO: Omit<BlankStateProps, "action" | "compact"> = {
  art: { image: "05_batch-generation.png" },
  title: "Library",
  line: "Everything you make and upload, in one place.",
  steps: [
    { icon: Sparkles, title: "Make something", text: "Images, video and audio from Create are saved here by themselves." },
    { icon: Upload, title: "Upload your own", text: "Add files in Create with the + button. They appear here too." },
    { icon: FolderPlus, title: "Sort into folders", text: "Press New below, then use the folder icon on any item." },
  ],
}

/** The Agent page's blank state: what it does with a goal, and what keeps it in check. */
export const AGENT_INTRO: Omit<BlankStateProps, "action" | "compact"> = {
  art: { image: "04_agent.png" },
  title: "Agent",
  line: "Give it a goal. It plans the work and makes the images, video and audio.",
  steps: [
    { icon: Target, title: "State the goal", text: "For example a short ad or a set of product pictures. / adds a skill to follow." },
    { icon: Layers, title: "Pick a group", text: "The group chosen in the composer decides which models make the media." },
    { icon: Wallet, title: "It stays in budget", text: "Each result is checked against the agent's spend limit first. You set it in Settings." },
  ],
}
