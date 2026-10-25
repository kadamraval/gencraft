import type { PriceOverride } from '@/lib/registry/types'
import type { FriendlyError } from '@/lib/errors/explain'
import type { AgentStep } from '@/lib/agent/types'
export * from './brand'

export type MainNavTab =
  | 'home'
  | 'docs'
  | 'support'
  | 'tutorials'
  | 'projects'
  | 'chat'
  | 'story'
  | 'apps'
  | 'brand'
  | 'library'
  | 'inspiration'

export interface Project {
  id: string
  title: string
  description: string
  createdAt: string
  updatedAt: string
  defaultMode: GenerationMode
  aspectRatio: string
  scenesCount: number
  assetsCount: number
}

export type ViewMode = 'chat' | 'grid' | 'list'

export type GenerationMode = 'chat' | 'video' | 'image' | 'audio' | 'plan'

export type MediaTypeFilter = 'all' | 'video' | 'image' | 'audio'
export type MediaStatusFilter = 'all' | 'completed' | 'generating' | 'failed'
export type GridDensity = 'small' | 'medium' | 'large'
export type DateRangeFilter = 'all' | 'today' | '7days' | '30days'
export type MediaActivityFilter = 'all' | 'generated' | 'uploaded' | 'liked' | 'downloaded'
export type LayoutMode = 'square' | 'masonry'
export type CardSizeStep = 1 | 2 | 3 | 4

export type SortOption =
  | 'newest'
  | 'oldest'
  | 'duration_asc'
  | 'duration_desc'
  | 'scene_order'
  | 'cost_asc'

export type ProviderType = 'replicate' | 'fal' | 'gemini' | 'runway' | 'kling' | 'comfyui' | 'openai' | 'openrouter'

export interface AIModel {
  id: string
  name: string
  provider: ProviderType
  type: 'video' | 'image' | 'multimodal' | 'audio' | 'plan' | 'chat'
  family?: string
  strikePrice?: string
  durationRange?: string
  maxDurationSeconds?: number
  costPerRun: string
  costNumeric: number
  resolution: string
  latency: string
  characterConsistencyScore: number
  description: string
  badge?: string
  skills?: string[] // model-wise specialized skills
  supportsReferences?: boolean
  supportsCharacterLock?: boolean
  supportedDurations?: number[]
  supportedAspectRatios?: string[]
  supportedResolutions?: string[]
  supportedCameraMotions?: string[]
  supportedBatchCounts?: number[]
}

export interface CharacterReference {
  id: string
  name: string
  imageUrl: string
  extractedAttributes: {
    face: string
    hair: string
    outfit: string
    lighting: string
    styleSignature: string
  }
  signatureToken: string
  verified: boolean
}

export interface VideoSceneBeat {
  id: string
  sceneNumber: number
  timeRange: string // e.g. "00:00 - 00:10"
  durationSeconds: number // typically 10s
  originalBeatPrompt: string
  injectedConsistentPrompt: string
  cameraMovement: string
  status: 'queued' | 'analyzing' | 'generating' | 'completed' | 'failed'
  progress: number
  videoUrl?: string
  thumbnailUrl?: string
  terminalFrameUrl?: string
  cost: string
  approved: boolean // Beat approval status
  modelSkill?: string // Model-wise skill
  assignedModelId?: string
}

export interface MediaAsset {
  id: string
  type: 'video' | 'image' | 'audio'
  title: string
  prompt: string
  url: string
  thumbnailUrl: string
  duration?: number
  aspectRatio: string
  model: string
  provider: ProviderType
  createdAt: string
  characterRefId?: string
  sceneNumber?: number
  batchId: string
  projectId?: string
  cost: string
  status: 'completed' | 'generating' | 'failed'
  /** Uploaded by the user, not generated. Absent means generated. */
  source?: 'generated' | 'uploaded'
  /** Failed runs are kept too: why it failed, the steps that ran, and the settings used */
  error?: string
  errorInfo?: FriendlyError
  log?: string[]
  params?: Record<string, unknown>
}

/** A generation that is running or has failed, shown as a card instead of a log. */
export interface GenerationJob {
  kind: "chat" | "image" | "video" | "audio"
  /** "queued" is waiting for a free place to run; startedAt is reset when it starts */
  status: "queued" | "running" | "failed"
  startedAt: number
  /** How many results are coming (images in a batch, clips in a sequence) */
  count: number
  /** From earlier runs of the same model; absent until it has been used once */
  expected?: { seconds: number; runs: number }
  modelName?: string
  aspectRatio?: string
  error?: string
  /** The failure explained for a person, with what to do about it */
  errorInfo?: FriendlyError
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  projectId?: string
  storyboardBatchId?: string
  scenes?: VideoSceneBeat[]
  images?: MediaAsset[]
  audio?: MediaAsset
  characterRef?: CharacterReference
  stepLogs?: string[]
  /** Chat and media replies are plain: no routing log. Only the agent shows its steps. */
  plain?: boolean
  job?: GenerationJob
  /** The agent's tool calls, updated live, and what it made */
  steps?: AgentStep[]
  assets?: MediaAsset[]
}

export type GroupModality = "text" | "image" | "video" | "audio"

export interface ModelGroup {
  id: string
  name: string
  /** One model per kind of output, with the default options to use for it */
  models: Partial<Record<GroupModality, { modelId: string; params?: Record<string, unknown> }>>
  /** Roles beyond the four above that the person set by hand; the others follow the level automatically */
  extra?: Partial<Record<"image-edit" | "video-edit" | "speech" | "music" | "stt", string>>
  /** A model the person chose by hand for one AI tool, by tool id */
  tools?: Record<string, string>
}

export interface SettingsState {
  general: {
    masterPasswordHash: string
    isPasswordConfigured: boolean
    autoLockMinutes: number
    exportPath: string
    reducedMotion: boolean
    autoLogoutOnClose: boolean
    profileName?: string
    profileEmail?: string
    profileAvatarUrl?: string
    serverRegion?: string
  }
  skills: {
    storyboardSkill: boolean
    characterConsistencyInjector: boolean
    terminalFrameBridging: boolean
    cinematicPromptEnhancer: boolean
    defaultCameraPreset: string
  }
  prompt: {
    systemInstruction: string
    negativePrompt: string
    qualityBoosters: string
    customStoryRules: string
  }
  brand: {
    brandName: string
    watermarkEnabled: boolean
    accentColor: string
    signatureTag: string
  }
  aiEngine: {
    geminiApiKey?: string
    openaiApiKey?: string
    falApiKey?: string
    replicateApiKey?: string
    openrouterApiKey?: string
    runwayApiKey?: string
    klingApiKey?: string
    comfyuiEndpoint?: string
    activeTextModelId?: string
    activeImageModelId?: string
    activeVideoModelId?: string
    activeAudioModelId?: string
    activeSpeechModelId?: string
    activeEmbeddingModelId?: string
    activeMultimodalModelId?: string
    autoLockModels?: boolean
    bypassSafetyChecker?: boolean
    fallbackModels?: Record<string, string[]>
    /** Models switched on in Settings. Empty or missing means the defaults. Only these appear in the chat picker. */
    enabledChatModelIds?: string[]
    /** Named bundles such as Low, Medium, High. The agent uses the active group's models. */
    groups?: ModelGroup[]
    activeGroupId?: string
    /** Prices the user corrected, by model id. They win over anything fetched. */
    priceOverrides?: Record<string, PriceOverride>
    /** The person's own Composio key, used to connect apps such as Pinterest */
    composioApiKey?: string
    /** The most one agent run may spend, in US dollars. Default 2. */
    agentBudgetUsd?: number
    /** A result up to this price is made without asking. Dearer ones ask first. Default 0.5. */
    agentAutoApproveUsd?: number
    /** Ask the person to approve the agent's plan before it makes anything. Default on. */
    agentApprovePlan?: boolean
    /** Add the missing light, camera or style to a short image or video prompt before it is sent. Default on. */
    improvePrompts?: boolean
    /** Let the chat search the web where its provider offers it (OpenAI, Google, OpenRouter). Default off. */
    chatWebSearch?: boolean
    /** What the person wants every chat to know: who they are, their tone, their language. Sent with each chat. */
    chatInstructions?: string
    /** Chat and the agent save lasting facts and use what is saved. Default on. */
    memoryEnabled?: boolean
    /** Which model turns speech into text. Absent means the browser's own. */
    speechToText?: { provider: "openai" | "gemini"; model: string }
    /** Which model speaks replies. Absent means the browser's own voice. */
    textToSpeech?: { provider: "openai"; model: string; voice: string }
    /** Language spoken to the app, for example en-US. Absent means the device language. */
    speechLanguage?: string
    /** Turn a spoken request into a clean prompt before it is used */
    polishSpoken?: boolean
    /** Guard rails on what a run may do or cost. A missing value means no limit. */
    limits?: {
      monthlyBudgetUsd?: number
      confirmOverUsd?: number
      maxResults?: number
      maxVideoSeconds?: number
      keepHistoryDays?: number
      deleteFailedDays?: number
      /** How many runs go at once. More wait their turn. Missing means 3. */
      maxConcurrent?: number
      /** Warn once when the Library on this device grows past this many GB */
      librarySizeWarnGb?: number
    }
  }
  integrations?: {
    googleDrive: {
      connected: boolean
      folder: string
      autoSync: boolean
    }
    dropbox: {
      connected: boolean
      path: string
      autoSync: boolean
    }
    cloudflare: {
      connected: boolean
      accountId: string
      bucket: string
      customDomain: string
    }
  }
  cost: {
    monthlyBudget: number
    totalSpent: number
    currency: string
    autoStopOnBudget: boolean
  }
}
