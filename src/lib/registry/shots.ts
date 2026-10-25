import type { ModelRecord } from "./types"

/**
 * Where a video model's several-shots control lives. Either the host has a yes/no switch of its own (`multi_shots`,
 * `multi_shot`), or the maker documents shots written in the prompt and the app adds a virtual `multi_shot` switch that
 * shapes the prompt. Both look the same to the person: one Shots switch.
 */
export interface ShotsSwitch {
  key: string
  /** True when it is the app's own switch (the shots are written into the prompt), not a field the host takes */
  virtual: boolean
}

const NATIVE_KEY = /^multi_?shots?$/

type Target = Pick<ModelRecord, "modality" | "params">

/** The host's own yes/no shots switch, when it has one. */
export function nativeShotsKey(record: Target): string | undefined {
  if (record.modality !== "video") return undefined
  const props = record.params.properties
  return Object.keys(props).find((k) => NATIVE_KEY.test(k) && props[k]!.type === "boolean" && !props[k]!.rejected && !props[k]!.virtual)
}

export function shotsSwitch(record: Target): ShotsSwitch | undefined {
  if (record.modality !== "video") return undefined
  const props = record.params.properties
  const key = Object.keys(props).find((k) => NATIVE_KEY.test(k) && props[k]!.type === "boolean" && !props[k]!.rejected)
  return key ? { key, virtual: Boolean(props[key]!.virtual) } : undefined
}
