import { AIModel } from "@/types"

export interface PricingEstimate {
  credits: number
  costUsd: number
  displayCredits: string
  displayUsd: string
  details: string
}

// Fixed exchange: 1 USD = 25 Credits (1 Credit = $0.04)
export const CREDITS_PER_USD = 25

export function calculateGenerationPrice(params: {
  model: AIModel
  mode: "video" | "image" | "audio" | "plan" | "chat"
  duration?: number // seconds for video or audio
  batchCount?: number // images
  resolution?: string
  tokenCount?: number
}): PricingEstimate {
  const { model, mode, duration = 10, batchCount = 1, resolution = "1080p", tokenCount = 450 } = params

  const id = model.id.toLowerCase()
  const provider = model.provider

  // 1. Free Local ComfyUI
  if (provider === "comfyui") {
    return {
      credits: 0,
      costUsd: 0,
      displayCredits: "0 credits (Free)",
      displayUsd: "$0.000",
      details: "Local GPU execution (100% Free · $0.00)",
    }
  }

  let costUsd = 0
  let details = ""

  if (mode === "video") {
    // Replicate Wan official: 480p: $0.025/s, 720p: $0.05/s, 1080p/4K: $0.10/s
    if (id.includes("wan")) {
      const perSec = resolution === "480p" ? 0.025 : resolution === "1080p" || resolution === "4K" ? 0.10 : 0.05
      costUsd = perSec * duration
      details = `Wan Video (${duration}s @ ${resolution}) · $${costUsd.toFixed(3)} ($${perSec.toFixed(3)}/s Replicate)`
    } else if (id.includes("kling")) {
      // Kling 1.5 / 3.0 wholesale: $0.070 / 5s, $0.140 / 10s
      const chunks = Math.max(1, Math.round(duration / 5))
      costUsd = 0.070 * chunks
      details = `Kling Video (${duration}s @ ${resolution}) · $${costUsd.toFixed(3)} fal.ai wholesale`
    } else if (id.includes("runway")) {
      // Runway Gen-3 / Gen-4.5: $0.100 / 10s
      costUsd = 0.100 * Math.max(1, Math.round(duration / 10))
      details = `Runway (${duration}s @ ${resolution}) · $${costUsd.toFixed(3)} wholesale`
    } else if (id.includes("veo")) {
      // Google Veo: $0.150 / 10s
      costUsd = 0.150 * Math.max(1, Math.round(duration / 10))
      details = `Google Veo (${duration}s @ ${resolution}) · $${costUsd.toFixed(3)} DeepMind wholesale`
    } else if (id.includes("minimax")) {
      costUsd = 0.050 * Math.max(1, Math.round(duration / 6))
      details = `MiniMax Video (${duration}s) · $${costUsd.toFixed(3)} wholesale`
    } else if (id.includes("ltx")) {
      costUsd = 0.050 * Math.max(1, Math.round(duration / 10))
      details = `LTX-Video (${duration}s) · $${costUsd.toFixed(3)} wholesale`
    } else {
      costUsd = (model.costNumeric || 0.08) * Math.max(1, Math.round(duration / 10))
      details = `${model.name} (${duration}s @ ${resolution}) · $${costUsd.toFixed(3)} wholesale`
    }
  } else if (mode === "image") {
    // FLUX Schnell: $0.003 / image
    if (id.includes("schnell")) {
      costUsd = 0.003 * batchCount
      details = `${batchCount}x FLUX Schnell · $${costUsd.toFixed(3)} wholesale ($0.003/img)`
    } else if (id.includes("dev")) {
      costUsd = 0.025 * batchCount
      details = `${batchCount}x FLUX Dev · $${costUsd.toFixed(3)} wholesale ($0.025/img)`
    } else if (id.includes("pro") || id.includes("flux-1.1") || id.includes("flux.3")) {
      costUsd = 0.040 * batchCount
      details = `${batchCount}x FLUX Pro · $${costUsd.toFixed(3)} wholesale ($0.040/img)`
    } else if (id.includes("dall-e")) {
      costUsd = 0.040 * batchCount
      details = `${batchCount}x DALL-E 3 · $${costUsd.toFixed(3)} OpenAI wholesale`
    } else {
      costUsd = (model.costNumeric || 0.02) * batchCount
      details = `${batchCount}x ${model.name} · $${costUsd.toFixed(3)} wholesale`
    }
  } else if (mode === "audio") {
    costUsd = 0.010 * Math.max(1, Math.round(duration / 30))
    details = `Studio Audio (${duration}s) · $${costUsd.toFixed(3)} wholesale`
  } else if (mode === "plan") {
    // Gemini 2.0 Flash / Director Agent is free on AI Studio standard tier
    if (id.includes("flash") || provider === "gemini") {
      costUsd = 0.000
      details = `Director Agent (Gemini 2.0 Flash) · Free Tier ($0.00)`
    } else {
      costUsd = 0.001
      details = `Director Agent (${model.name}) · $0.001 wholesale`
    }
  } else if (mode === "chat") {
    if (id.includes("flash") || id.includes("nano")) {
      costUsd = 0.000
      details = `${model.name} · Free Tier ($0.00)`
    } else if (id.includes("pro")) {
      costUsd = (tokenCount / 1_000_000) * 1.25
      details = `${tokenCount} Tokens (${model.name}) · $${costUsd.toFixed(4)} wholesale`
    } else if (id.includes("r1") || id.includes("deepseek")) {
      costUsd = (tokenCount / 1_000_000) * 0.55
      details = `${tokenCount} Tokens (DeepSeek R1) · $${costUsd.toFixed(4)} wholesale`
    } else {
      costUsd = (tokenCount / 1_000_000) * 2.50
      details = `${tokenCount} Tokens (${model.name}) · $${costUsd.toFixed(4)} wholesale`
    }
  }

  const roundedUsd = Math.round(costUsd * 1000) / 1000
  const credits = Math.round(costUsd * CREDITS_PER_USD * 10) / 10

  return {
    credits,
    costUsd: roundedUsd,
    displayCredits: roundedUsd === 0 ? "Free ($0.00)" : `$${roundedUsd.toFixed(3)} wholesale`,
    displayUsd: roundedUsd === 0 ? "$0.000 (Free Tier)" : `$${roundedUsd.toFixed(3)}`,
    details,
  }
}
