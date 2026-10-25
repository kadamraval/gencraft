import { EMPTY_SCHEMA } from "./types"
import type { ModelRecord, RegistryModality } from "./types"
import { fetchFalRecord } from "./adapters/fal"
import { fetchOpenRouterRecord } from "./adapters/openrouter"
import { fetchReplicateRecord } from "./adapters/replicate"
import { replicateCall } from "./net"

/**
 * Models the person adds by hand: a provider and the model's id. The model's settings are read from the
 * provider where it publishes them. A custom model is kept across refreshes and is never pruned.
 */

const KEY = "gencraft_custom_models_v1"
const NAMES_KEY = "gencraft_model_names_v1"

export function readCustomModels(): ModelRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as ModelRecord[]) : []
  } catch {
    return []
  }
}

export function saveCustomModels(models: ModelRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(models))
  } catch {
    // storage unavailable: the model lasts until the app closes
  }
}

export function readModelNames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(NAMES_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function writeModelNames(names: Record<string, string>) {
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify(names))
  } catch {
    // storage unavailable: the name lasts until the app closes
  }
}

export interface NewModel {
  provider: "fal" | "replicate" | "openrouter" | "openai" | "gemini"
  /** The model's id at the provider, for example fal-ai/flux/dev or black-forest-labs/flux-schnell */
  modelId: string
  /** Needed where the provider does not say what a model makes */
  modality: RegistryModality
  keys: { fal?: string; replicate?: string }
}

/** Reads the model from its provider and returns a record. Throws a plain message when it cannot. */
export async function buildCustomModel(input: NewModel): Promise<ModelRecord> {
  const id = input.modelId.trim()
  if (!id) throw new Error("Enter the model's id.")
  let record: ModelRecord
  if (input.provider === "fal") record = await fetchFalRecord(id, input.keys.fal)
  else if (input.provider === "replicate") {
    if (!input.keys.replicate) throw new Error("Add your Replicate key first.")
    record = await fetchReplicateRecord(replicateCall(input.keys.replicate), id, input.modality)
  } else if (input.provider === "openrouter") record = await fetchOpenRouterRecord(id)
  else {
    // OpenAI and Gemini publish no settings for a model: it runs with a prompt, and the person can say what it makes
    record = {
      id: `${input.provider}/${id}`,
      endpoint: id,
      provider: input.provider,
      name: id,
      family: id,
      logoKey: input.provider,
      modality: input.modality,
      inputs: ["text"],
      params: EMPTY_SCHEMA,
      price: { unit: "unknown", amount: null, source: "estimate", fetchedAt: new Date().toISOString() },
      status: "active",
    }
  }
  return { ...record, custom: true }
}
