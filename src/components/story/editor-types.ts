import type { GenerateArgs, GenerateKind } from "@/lib/agent/types"
import type { SpendLimits } from "@/lib/agent/policy"
import type { AgentToolEnv } from "@/lib/ai-tools/agent-env"
import type { EditProject } from "./edit-model"

/** A file the agent made, as the page can use it */
export interface MadeAsset {
  id: string
  url: string
  title: string
  type: "image" | "video" | "audio"
}

/** A paid step the agent wants to take. The person approves or denies it on a card. */
export interface ApprovalRequest {
  kind: GenerateKind | "plan"
  /** For a plan: the steps the agent means to take */
  steps?: string[]
  prompt: string
  /** The price, or null when it is not known */
  usd: number | null
  /** What is left of the budget */
  remainingUsd: number
}

/** What the agent needs to make media. Without it the agent only cuts what is already there. */
export interface EditorMaking {
  generate: (kind: GenerateKind, args: GenerateArgs) => Promise<{ assetIds: string[]; costUsd: number; assets?: MadeAsset[] }>
  estimate: (kind: GenerateKind, args: GenerateArgs) => number | null
  limits: SpendLimits
  approve: (request: ApprovalRequest) => Promise<boolean>
  /** Puts a made sound in the Library and says how long it is, so it can go on a lane */
  placeSound: (asset: MadeAsset) => Promise<{ uploadId: string; name: string; seconds: number }>
  /** How long a made video is */
  videoSeconds: (url: string) => Promise<number>
  /** The AI tools (remove background, upscale, voice isolation ...) on clips and sounds of the cut; present when the page can run them */
  tools?: AgentToolEnv
}

/** What the page lends the agent besides making media */
export interface EditorHost {
  /** Shows the plan to the person and waits for a yes or a no */
  approvePlan: (plan: { summary: string; steps: string[] }) => Promise<boolean>
  /** The address of a sound in the Library, from its id */
  soundUrl: (uploadId: string) => string | undefined
  /** The words spoken in a sound of the Library, as plain text. Missing when no speech model is set. */
  transcribe?: (uploadId: string) => Promise<string>
  /** How bright and colourful a picture or a moment of a video is */
  frameStats?: (url: string, kind: "video" | "image", at?: number) => Promise<{ luma: number; saturation: number } | null>
  /** Where a video cuts from one shot to another, in seconds in the footage */
  sceneChanges?: (url: string, from: number, to: number) => Promise<number[] | null>
}

/**
 * The editing agent: a chat model that cuts the story by calling tools, each of them one of the plain functions in
 * edit-model.ts that the buttons use. It works on a draft of the cut and the page commits the draft once when the
 * run ends, so everything the agent did is one step to undo (Ctrl+Z). It cannot make new media or spend money here:
 * it works with the beats and files already in the cut.
 */





export interface EditorRun {
  /** What the agent said at the end, in plain words */
  text: string
  project: EditProject
  /** One line for each change it made */
  changes: string[]
}
