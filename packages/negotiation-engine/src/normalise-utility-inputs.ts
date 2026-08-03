/**
 * Shared normalisation for both utility functions.
 *
 * Every utility component is normalised to [0,1] against that side's OWN
 * private bounds. Raw utilities are not comparable across sides and must never
 * be compared in code: a buyer utility of 0.7 and a seller utility of 0.7 mean
 * nothing relative to each other, because they are measured against different
 * private scales.
 */

import { slaTierRank } from "@parley/shared";
import type { MicroUsdc, SlaTier } from "@parley/shared";

/** Min-max normalise into [0,1]. Degenerate ranges return 1, never NaN. */
export function norm(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return 0;
  if (hi === lo) return 1;
  const scaled = (value - lo) / (hi - lo);
  if (scaled < 0) return 0;
  if (scaled > 1) return 1;
  return scaled;
}

/** Same, for bigint money. Converted via Number only after the ratio. */
export function normMicro(
  value: MicroUsdc,
  lo: MicroUsdc,
  hi: MicroUsdc,
): number {
  if (hi === lo) return 1;
  if (value <= lo) return 0;
  if (value >= hi) return 1;
  // Scale by 1e6 before the division so integer arithmetic keeps precision,
  // then convert once. Keeps floats out of the comparison itself.
  const scaled = ((value - lo) * 1_000_000n) / (hi - lo);
  return Number(scaled) / 1_000_000;
}

export function slaToOrdinal(tier: SlaTier): number {
  return slaTierRank(tier);
}

/** Weights for one side's utility. Must sum to 1. */
export interface UtilityWeights {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
}

export function assertWeightsSumToOne(
  weights: UtilityWeights,
  label: string,
): void {
  const total = weights.a + weights.b + weights.c + weights.d;
  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(`${label} utility weights must sum to 1, got ${total}`);
  }
}
