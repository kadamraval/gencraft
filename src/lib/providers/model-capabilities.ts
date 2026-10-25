import { AIModel, CharacterReference, ProviderType, SettingsState } from "@/types"
import { getAllModels } from "./catalog"
import { ReferenceMediaItem } from "@/components/chat/media-reference-modal"
import { MentionReferenceItem } from "@/components/chat/mention-popover"

export interface ModelCapabilityReport {
  modelId: string
  modelName: string
  provider: ProviderType
  modality: "video" | "image" | "multimodal" | "audio" | "plan" | "chat"
  supportsReferenceImage: boolean
  supportsDualKeyframe: boolean
  supportsReferenceVideo: boolean
  supportsCharacterLock: boolean
  supportsAudioScore: boolean
  supportsCameraControl: boolean
  supportsUncensoredBypass: boolean
  supportedAspectRatios: string[]
  supportedDurations: number[]
  supportedResolutions: string[]
  recommendedUse: string
  activeBadges: string[]
}

/**
 * Dynamically resolves concrete capabilities for any model in the catalog or custom BYOK model.
 */
export function resolveModelCapabilities(modelOrId: AIModel | string): ModelCapabilityReport {
  const model: AIModel =
    typeof modelOrId === "string"
      ? getAllModels().find((m) => m.id === modelOrId) || {
          id: modelOrId,
          name: modelOrId,
          provider: "fal",
          type: "video",
          costPerRun: "$0.05",
          costNumeric: 0.05,
          resolution: "1080p",
          latency: "5s",
          characterConsistencyScore: 85,
          description: "Custom AI Model",
        }
      : modelOrId

  const id = model.id.toLowerCase()
  const family = (model.family || "").toLowerCase()
  const provider = model.provider

  // 1. Image-to-Video / Image Reference Support
  const supportsReferenceImage = Boolean(
    model.supportsReferences ||
      model.type === "image" ||
      id.includes("wan") ||
      id.includes("kling") ||
      id.includes("runway") ||
      id.includes("flux") ||
      id.includes("sdxl") ||
      id.includes("minimax") ||
      id.includes("seedance") ||
      id.includes("higgsfield") ||
      id.includes("comfyui") ||
      id.includes("i2v")
  )

  // 1b. Dual Keyframe (Start Frame + End Frame Interpolation) Support
  const supportsDualKeyframe = Boolean(
    model.type === "video" &&
      (id.includes("wan") ||
        id.includes("kling") ||
        id.includes("runway") ||
        id.includes("veo") ||
        family.includes("wan") ||
        family.includes("kling") ||
        family.includes("runway") ||
        family.includes("veo") ||
        id.includes("comfyui"))
  )

  // 2. Video Reference / Video-to-Video / Motion Trajectory Support
  const supportsReferenceVideo = Boolean(
    id.includes("wan") ||
      id.includes("runway") ||
      id.includes("kling") ||
      id.includes("v2v") ||
      id.includes("motion") ||
      family.includes("wan") ||
      family.includes("runway") ||
      id.includes("comfyui")
  )

  // 3. Character Consistency Lock Support
  const supportsCharacterLock = Boolean(
    model.supportsCharacterLock ||
      (model.characterConsistencyScore && model.characterConsistencyScore >= 88) ||
      id.includes("flux") ||
      id.includes("sdxl") ||
      id.includes("wan") ||
      id.includes("gemini") ||
      id.includes("character")
  )

  // 4. Audio Score / Sound Generation Support
  const supportsAudioScore = Boolean(
    model.type === "audio" ||
      id.includes("music") ||
      id.includes("audio") ||
      id.includes("sound") ||
      id.includes("veo") ||
      id.includes("whisper")
  )

  // 5. Camera Control / Director Trajectory Support
  const supportsCameraControl = Boolean(
    model.type === "video" &&
      (id.includes("kling") ||
        id.includes("runway") ||
        id.includes("wan") ||
        id.includes("higgsfield") ||
        id.includes("cinema-studio"))
  )

  // 6. Uncensored Safety Bypass Support (fal.ai, replicate, local comfyui)
  const supportsUncensoredBypass = Boolean(
    provider === "fal" || provider === "replicate" || provider === "comfyui"
  )

  // Active Badges for UI Pills
  const activeBadges: string[] = []
  if (supportsCharacterLock) activeBadges.push("Char Lock")
  if (supportsReferenceVideo) activeBadges.push("Motion Ref")

  let recommendedUse = "Generative video model"
  if (supportsReferenceVideo) {
    recommendedUse = "Motion trajectory lock & video continuity"
  } else if (supportsCharacterLock && supportsReferenceImage) {
    recommendedUse = "Character identity anchor"
  } else if (supportsCameraControl) {
    recommendedUse = "Cinematic camera movements"
  }

  return {
    modelId: model.id,
    modelName: model.name,
    provider,
    modality: model.type,
    supportsReferenceImage,
    supportsDualKeyframe,
    supportsReferenceVideo,
    supportsCharacterLock,
    supportsAudioScore,
    supportsCameraControl,
    supportsUncensoredBypass,
    supportedAspectRatios: model.supportedAspectRatios || ["16:9", "9:16", "1:1", "21:9"],
    supportedDurations: model.supportedDurations || [5, 10],
    supportedResolutions: model.supportedResolutions || ["1080p", "720p"],
    recommendedUse,
    activeBadges,
  }
}

export interface AdaptedGenerationPackage {
  adaptedPrompt: string
  referenceImageUrl?: string
  referenceVideoUrl?: string
  startFrameUrl?: string
  endFrameUrl?: string
  cameraMotion?: string
  characterSignature?: string
  enableSafetyChecker: boolean // default false (Uncensored)
  appliedCapabilities: string[]
  suggestedModelFallback?: {
    modelId: string
    reason: string
  }
}

/**
 * Automatically inspects the user prompt, attachments, character anchor, and active model,
 * assembling the optimal payload conditioning and injecting prompt anchors according to
 * the selected model's true capabilities.
 */
export function adaptGenerationPackage(params: {
  rawPrompt: string
  activeModel: AIModel
  settings: SettingsState
  characterRef?: CharacterReference
  referenceMedia?: ReferenceMediaItem[]
  mentionItems?: MentionReferenceItem[]
  startFrameUrl?: string
  endFrameUrl?: string
  cameraMotion?: string
  aspectRatio?: string
}): AdaptedGenerationPackage {
  const {
    rawPrompt,
    activeModel,
    settings,
    characterRef,
    referenceMedia = [],
    mentionItems = [],
    startFrameUrl,
    endFrameUrl,
    cameraMotion,
  } = params
  const caps = resolveModelCapabilities(activeModel)
  const applied: string[] = []

  let adaptedPrompt = rawPrompt.trim()
  let referenceImageUrl: string | undefined = startFrameUrl
  let referenceVideoUrl: string | undefined
  let characterSignature: string | undefined
  let suggestedModelFallback: { modelId: string; reason: string } | undefined

  // 1. SAFETY CHECKER: Default to OFF (Bypass active) unless explicitly disabled in settings
  const bypassSafety = settings.aiEngine?.bypassSafetyChecker === true
  const enableSafetyChecker = !bypassSafety
  if (bypassSafety && caps.supportsUncensoredBypass) {
    applied.push("Uncensored Mode (Safety Checker Bypassed)")
  }

  // 2. DUAL KEYFRAME CONDITIONING (Wan 3.0, Kling 3.0, Runway Gen-4.5)
  if (startFrameUrl) {
    applied.push("Start Keyframe Locked")
  }
  if (endFrameUrl) {
    if (caps.supportsDualKeyframe) {
      applied.push("End Frame Interpolation Locked")
    } else {
      applied.push("End Frame attached (Visual Continuity conditioning)")
      adaptedPrompt = `${adaptedPrompt} [Terminal Frame Conditioning: Ensure scene resolves to reference composition]`
    }
  }

  // 2b. 3D CAMERA TRAJECTORY
  if (cameraMotion && cameraMotion !== "static") {
    if (caps.supportsCameraControl) {
      applied.push(`Camera Trajectory: ${cameraMotion}`)
      adaptedPrompt = `[Camera Movement: ${cameraMotion.replace("-", " ").toUpperCase()}] ${adaptedPrompt}`
    } else {
      adaptedPrompt = `${adaptedPrompt} (cinematic ${cameraMotion.replace("-", " ")} camera motion)`
    }
  }

  // 3. REFERENCE VIDEO HANDLING (V2V / Motion)
  const videoRef = referenceMedia.find((m) => m.type === "video")
  if (videoRef) {
    if (caps.supportsReferenceVideo) {
      referenceVideoUrl = videoRef.url
      applied.push(`Video Motion Ref: ${videoRef.title || "Attached Video"}`)
    } else {
      // Model doesn't support video reference natively: extract fallback or suggest Wan
      if (!referenceImageUrl) {
        referenceImageUrl = videoRef.thumbnailUrl || videoRef.url
      }
      applied.push("Extracted Video Keyframe as Image Anchor")
      suggestedModelFallback = {
        modelId: "wan-2.6",
        reason: `${activeModel.name} does not natively support Video-to-Video. Recommend Wan 3.0 or Runway Gen-4.5.`,
      }
    }
  }

  // 4. REFERENCE IMAGE / KEYFRAME HANDLING (I2V / I2I)
  const imageRef = referenceMedia.find((m) => m.type === "image")
  if (imageRef && !referenceImageUrl) {
    referenceImageUrl = imageRef.url
    if (caps.supportsReferenceImage) {
      applied.push(`Keyframe Condition: ${imageRef.title || "Attached Image"}`)
    } else {
      // Pure text-to-video: inject visual descriptive anchor into prompt text
      adaptedPrompt = `${adaptedPrompt} [Visual Conditioning: Exact composition and color grade matching reference keyframe]`
      applied.push("Visual Keyframe Anchor injected into text")
    }
  }

  // 5. MENTION REFERENCES (@image, @cloth, @location)
  if (mentionItems.length > 0) {
    mentionItems.forEach((item) => {
      if (!referenceImageUrl) {
        referenceImageUrl = item.imageUrl
      }
      adaptedPrompt = `${adaptedPrompt} [Asset Reference: ${item.name} (${item.category || "Style Reference"})]`
      applied.push(`@Reference: ${item.name}`)
    })
  }

  // 6. CHARACTER CONSISTENCY ANCHOR INJECTION
  if (characterRef) {
    characterSignature = characterRef.signatureToken || characterRef.id
    if (caps.supportsCharacterLock) {
      applied.push(`Character Identity Locked: ${characterRef.name}`)
      if (!referenceImageUrl) {
        referenceImageUrl = characterRef.imageUrl
      }
    }

    // Always inject descriptive anchor tokens to prevent facial/clothing identity drift
    const charDetails = characterRef.extractedAttributes
      ? `Subject: ${characterRef.name}, Face: ${characterRef.extractedAttributes.face}, Hair: ${characterRef.extractedAttributes.hair}, Wardrobe: ${characterRef.extractedAttributes.outfit}`
      : `Subject: ${characterRef.name} (Signature Anchor: ${characterRef.signatureToken})`

    adaptedPrompt = `${adaptedPrompt} [${charDetails}]`
  }

  return {
    adaptedPrompt,
    referenceImageUrl,
    referenceVideoUrl,
    startFrameUrl,
    endFrameUrl,
    cameraMotion,
    characterSignature,
    enableSafetyChecker,
    appliedCapabilities: applied,
    suggestedModelFallback,
  }
}
