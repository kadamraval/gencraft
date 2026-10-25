import { fieldsNamedIn, recordParamChecks } from "../registry/param-checks"
import type { ModelRecord, ParamProperty, ParamSchema } from "../registry/types"
import type { LiteLLMCapabilities } from "./engine"

/**
 * LiteLLM-Style OpenAI-Standard Parameter Layer (`getSupportedOpenAIParams` + `drop_params = true`).
 *
 * Ensures every model across OpenAI, Gemini, OpenRouter, Fal.ai, and Replicate exposes a consistent
 * OpenAI-compatible parameter schema, translates parameter aliases automatically, and strips any
 * provider-rejected parameter on the fly (`drop_params = true`) so runs never fail from schema gaps.
 */

/** Canonical parameter alias groups: maps a standard concept to the field names providers use. */
export const PARAM_ALIAS_GROUPS: Record<string, readonly string[]> = {
  aspect_ratio: ["aspect_ratio", "aspectRatio", "image_size", "size", "ratio"],
  resolution: ["resolution", "quality", "video_resolution", "output_resolution"],
  duration: ["duration", "seconds", "duration_seconds", "video_length", "length", "num_seconds"],
  generate_audio: ["generate_audio", "with_audio", "enable_audio", "include_audio", "audio", "sound"],
  num_images: ["num_images", "n", "num_outputs", "batch_size", "number_of_images"],
  seed: ["seed", "random_seed"],
  negative_prompt: ["negative_prompt", "negativePrompt"],
  upscale_factor: ["upscale_factor", "scale", "factor", "upscaling_factor"],
  voice: ["voice", "voice_id", "voice_name", "speaker"],
  reasoning_effort: ["reasoning_effort", "thinking_level", "reasoning"],
}

/** Standard OpenAI-compatible baseline properties per modality when a host omits schema details. */
export function standardPropertiesForModality(
  record: Pick<ModelRecord, "modality" | "task" | "endpoint" | "inputs">,
  caps?: LiteLLMCapabilities,
): Record<string, ParamProperty> {
  const props: Record<string, ParamProperty> = {}
  const task = (record.task ?? "").toLowerCase()
  const ep = record.endpoint.toLowerCase()

  if (record.modality === "image") {
    props.aspect_ratio = {
      type: "string",
      title: "Aspect ratio",
      enum: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
      default: "1:1",
      tier: "common",
    }
    props.resolution = {
      type: "string",
      title: "Resolution",
      enum: ["1k", "2k"],
      default: "1k",
      tier: "common",
    }
    props.num_images = {
      type: "integer",
      title: "Images",
      enum: [1, 2, 4],
      default: 1,
      minimum: 1,
      maximum: 4,
      tier: "common",
    }
    if (task === "image-to-image" || task === "image-edit" || ep.includes("edit") || record.inputs.includes("image")) {
      props.image_url = {
        type: "string",
        title: "Reference image",
        format: "image",
        slot: { kind: "image", role: "reference", list: false, max: 1 },
        tier: "common",
      }
    }
  } else if (record.modality === "video") {
    props.aspect_ratio = {
      type: "string",
      title: "Aspect ratio",
      enum: ["16:9", "9:16", "1:1"],
      default: "16:9",
      tier: "common",
    }
    props.resolution = {
      type: "string",
      title: "Resolution",
      enum: ["720p", "1080p"],
      default: "720p",
      tier: "common",
    }
    props.duration = {
      type: "integer",
      title: "Duration (s)",
      enum: [5, 8, 10],
      default: 5,
      tier: "common",
    }
    if (task === "image-to-video" || ep.includes("image-to-video") || ep.includes("i2v")) {
      props.image_url = {
        type: "string",
        title: "Start frame",
        format: "image",
        slot: { kind: "image", role: "start", list: false, max: 1 },
        tier: "common",
      }
    } else if (task === "reference-to-video" || ep.includes("reference-to-video")) {
      props.reference_image_urls = {
        type: "array",
        title: "Reference images",
        format: "image",
        slot: { kind: "image", role: "reference", list: true, max: 4 },
        tier: "common",
      }
    }
  } else if (record.modality === "audio") {
    const isSpeech = task === "text-to-speech" || task === "speech" || ep.includes("tts") || ep.includes("speech")
    if (isSpeech) {
      props.voice = {
        type: "string",
        title: "Voice",
        default: "alloy",
        tier: "unique",
      }
    } else {
      props.duration = {
        type: "integer",
        title: "Duration (s)",
        enum: [10, 15, 30],
        default: 15,
        minimum: 1,
        maximum: 120,
        tier: "common",
      }
    }
  } else if (record.modality === "text") {
    if (caps?.reasoning) {
      props.reasoning_effort = {
        type: "string",
        title: "Reasoning effort",
        enum: ["low", "medium", "high"],
        default: "medium",
        tier: "unique",
      }
    }
  }

  return props
}

/**
 * Returns the list of supported OpenAI-standard parameter names for a model record (`get_supported_openai_params` equivalent).
 */
export function getSupportedOpenAIParams(record: ModelRecord, caps?: LiteLLMCapabilities): string[] {
  const schemaKeys = Object.keys(record.params.properties).filter((k) => !record.params.properties[k]?.rejected)
  if (schemaKeys.length > 0) {
    const canonical = new Set<string>(schemaKeys)
    for (const [stdKey, aliases] of Object.entries(PARAM_ALIAS_GROUPS)) {
      if (aliases.some((a) => schemaKeys.includes(a))) canonical.add(stdKey)
    }
    return [...canonical]
  }
  return Object.keys(standardPropertiesForModality(record, caps))
}

/**
 * Ensures a model record has a rich, usable parameter schema by filling in missing standard OpenAI properties
 * when a host provides an empty or partial schema.
 */
export function withStandardParams(record: ModelRecord, caps?: LiteLLMCapabilities): ModelRecord {
  const existing = record.params.properties
  if (Object.keys(existing).length > 0 && record.modality !== "text") return record
  const std = standardPropertiesForModality(record, caps)
  if (Object.keys(std).length === 0) return record

  const merged: Record<string, ParamProperty> = { ...existing }
  for (const [key, prop] of Object.entries(std)) {
    const aliases = PARAM_ALIAS_GROUPS[key] ?? [key]
    if (aliases.some((a) => a in merged)) continue
    merged[key] = prop
  }
  if (Object.keys(merged).length === Object.keys(existing).length) return record

  const nextSchema: ParamSchema = {
    ...record.params,
    properties: merged,
  }
  return { ...record, params: nextSchema }
}

/**
 * Translates caller-supplied parameters (using either OpenAI-standard names or host-specific names)
 * into the exact field names that `record.params.properties` expects.
 */
export function translateParamsToModelSchema(
  record: Pick<ModelRecord, "params">,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const props = record.params.properties
  const propKeys = Object.keys(props)
  if (propKeys.length === 0) return { ...params }

  const out: Record<string, unknown> = {}
  for (const [rawKey, rawVal] of Object.entries(params)) {
    if (rawVal === undefined || rawVal === null || rawVal === "") continue

    // 1. Exact match in model schema
    if (rawKey in props) {
      if (!props[rawKey]?.rejected) out[rawKey] = coerceValue(props[rawKey]!, rawVal)
      continue
    }

    // 2. Alias match in model schema (e.g. caller passed `duration`, model schema has `seconds`)
    let mappedKey: string | undefined
    for (const aliases of Object.values(PARAM_ALIAS_GROUPS)) {
      if (aliases.includes(rawKey)) {
        mappedKey = aliases.find((a) => a in props && !props[a]?.rejected)
        break
      }
    }

    if (mappedKey) {
      out[mappedKey] = coerceValue(props[mappedKey]!, rawVal)
    } else {
      // 3. Pass through if not explicitly rejected
      out[rawKey] = rawVal
    }
  }
  return out
}

function coerceValue(prop: ParamProperty, value: unknown): unknown {
  if ((prop.type === "integer" || prop.type === "number") && typeof value === "string") {
    const n = Number(value)
    if (Number.isFinite(n)) return prop.type === "integer" ? Math.round(n) : n
  }
  if (prop.type === "string" && typeof value === "number") {
    if (prop.enum?.some((e) => e === `${value}s`)) return `${value}s`
    return String(value)
  }
  if (prop.enum?.length) {
    const strVal = String(value).toLowerCase()
    const exact = prop.enum.find((e) => String(e).toLowerCase() === strVal || String(e).toLowerCase() === `${strVal}s`)
    if (exact !== undefined) return exact
  }
  return value
}

const UNSUPPORTED_FIELD = /unknown (field|parameter|input)|unexpected (field|property|keyword)|extra fields? not permitted|additional properties|unrecognized|not supported|unsupported/i
const VALUE_ERROR = /must be one of|invalid value|not a valid (value|choice|enum)|out of range|greater than|less than|at least|at most|should be (one of|between)|expected one of|enum/i

/**
 * LiteLLM `drop_params = true` auto-recovery helper:
 * When a provider responds with HTTP 400 / 422 naming one or more unsupported parameters,
 * records them as rejected and returns a cleaned payload ready for immediate retry.
 */
export function dropRejectedParamsOnError(
  record: Pick<ModelRecord, "id" | "params">,
  sentInput: Record<string, unknown>,
  errorMessage: string,
): { shouldRetry: boolean; cleanedInput: Record<string, unknown>; droppedFields: string[] } {
  const protectedKeys = new Set(["prompt", "text", "input", "messages", "model", record.params.request?.promptKey ?? "prompt"])
  const candidateKeys = Object.keys(sentInput).filter((k) => !protectedKeys.has(k))
  if (candidateKeys.length === 0) {
    return { shouldRetry: false, cleanedInput: sentInput, droppedFields: [] }
  }

  let badFields = fieldsNamedIn(errorMessage, candidateKeys)
  // If error explicitly says "extra fields not permitted" or "unexpected property" without naming a known key,
  // strip untested cross-host fields first
  if (badFields.length === 0 && /extra fields not permitted|additional properties are not allowed|unknown parameter/i.test(errorMessage)) {
    badFields = candidateKeys.filter((k) => record.params.properties[k]?.untested || !(k in record.params.properties))
  }

  if (badFields.length === 0) {
    return { shouldRetry: false, cleanedInput: sentInput, droppedFields: [] }
  }

  // A bad value ("must be one of", out of range) says nothing about the field itself: retry without it this once,
  // but do not remember the field as unsupported.
  if (!UNSUPPORTED_FIELD.test(errorMessage) && VALUE_ERROR.test(errorMessage)) {
    const once = new Set(badFields)
    return {
      shouldRetry: true,
      cleanedInput: Object.fromEntries(Object.entries(sentInput).filter(([k]) => !once.has(k))),
      droppedFields: badFields,
    }
  }

  recordParamChecks(record.id, badFields, "rejected")
  const dropSet = new Set(badFields)
  const cleanedInput = Object.fromEntries(Object.entries(sentInput).filter(([k]) => !dropSet.has(k)))
  return {
    shouldRetry: true,
    cleanedInput,
    droppedFields: badFields,
  }
}
