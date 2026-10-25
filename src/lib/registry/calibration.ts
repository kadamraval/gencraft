import type { ModelRecord } from "./types"

/**
 * A learned correction to a model's estimated price. A price list says what a unit costs, but how many units a run is (rounded
 * megapixels, the length the model really ran) is only known afterwards. Where a provider's own billing later tells what runs really
 * cost (fal's does), the ratio between the bill and our estimate is learned per model and applied to the next estimate.
 * Set by lib/ledger/fal-usage.ts; absent, estimates are the price list's.
 */

export type Calibration = (rec: Pick<ModelRecord, "provider" | "endpoint">) => number | null

let current: Calibration | null = null

export const setCalibration = (c: Calibration | null): void => {
  current = c
}

export const calibrationFor = (rec: Pick<ModelRecord, "provider" | "endpoint">): number | null => current?.(rec) ?? null
