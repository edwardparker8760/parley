/**
 * The seller's price floor, derived from cost basis, margin, and terms.
 *
 * This is what makes non-price terms genuinely negotiable rather than
 * decoration: a tighter delivery window or a higher SLA tier really does cost
 * the seller more, so it really does raise the floor. A buyer who wants
 * premium SLA in 12 hours is asking for something that cannot be sold at the
 * basic-tier price, and the arithmetic says so.
 *
 * Rounding is always UP (`ceil`), toward the seller's own safety. Rounding a
 * floor down would let a deal land a fraction below the owner's margin
 * requirement, which is exactly the failure this module exists to prevent.
 */

import type { MicroUsdc, SlaTier, Terms } from "@parley/shared";
import { slaTierRank } from "@parley/shared";

/**
 * Cost adjustment factors, in basis points added to the cost basis.
 * Exported so the dashboard can show the audience WHY the floor moved.
 */
export const TERMS_COST_ADJUSTMENTS = {
  /** Added per SLA tier above basic. 800bp = 8%. */
  perSlaTierAboveBasicBasisPoints: 800,
  /** Added when the delivery window is tighter than the threshold. */
  tightDeliveryBasisPoints: 1000,
  tightDeliveryThresholdHours: 24,
} as const;

/** Total cost uplift in basis points implied by a set of terms. */
export function termsCostUpliftBasisPoints(terms: Terms): number {
  const slaUplift =
    slaTierRank(terms.slaTier) *
    TERMS_COST_ADJUSTMENTS.perSlaTierAboveBasicBasisPoints;
  const deliveryUplift =
    terms.deliveryWindowHours < TERMS_COST_ADJUSTMENTS.tightDeliveryThresholdHours
      ? TERMS_COST_ADJUSTMENTS.tightDeliveryBasisPoints
      : 0;
  return slaUplift + deliveryUplift;
}

/** Ceiling division for positive bigints. */
function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new Error("ceilDivide requires a positive denominator");
  }
  return (numerator + denominator - 1n) / denominator;
}

/**
 * Minimum unit price the seller may accept for these terms.
 *
 * `ceil(costBasis * (10000 + termsUplift) / 10000 * (100 + minMargin) / 100)`,
 * evaluated in one expression so there is only one rounding step and no
 * intermediate truncation to lose a fraction of margin in.
 */
export function deriveSellerMinUnitPrice(
  guardrails: {
    readonly costBasisMicroUsdc: MicroUsdc;
    readonly minMarginPct: number;
  },
  terms: Terms,
): MicroUsdc {
  if (guardrails.costBasisMicroUsdc < 0n) {
    throw new Error("costBasisMicroUsdc cannot be negative");
  }
  if (!Number.isFinite(guardrails.minMarginPct) || guardrails.minMarginPct < 0) {
    throw new Error("minMarginPct must be a non-negative finite number");
  }

  const upliftBasisPoints = BigInt(10_000 + termsCostUpliftBasisPoints(terms));
  const marginNumerator = BigInt(Math.round(100 + guardrails.minMarginPct));

  const numerator =
    guardrails.costBasisMicroUsdc * upliftBasisPoints * marginNumerator;
  const denominator = 10_000n * 100n;

  return ceilDivide(numerator, denominator);
}

/** Convenience for the dashboard: the floor at each SLA tier, same window. */
export function sellerFloorBySlaTier(
  guardrails: {
    readonly costBasisMicroUsdc: MicroUsdc;
    readonly minMarginPct: number;
  },
  deliveryWindowHours: number,
): Record<SlaTier, MicroUsdc> {
  const tiers: SlaTier[] = ["basic", "standard", "premium"];
  const result = {} as Record<SlaTier, MicroUsdc>;
  for (const slaTier of tiers) {
    result[slaTier] = deriveSellerMinUnitPrice(guardrails, {
      slaTier,
      deliveryWindowHours,
    });
  }
  return result;
}
