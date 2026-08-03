/**
 * The BASELINE negotiation strategy. Deliberately dumb, deliberately kept.
 *
 * Phase 04 benchmarks the real engine (utility functions, adaptive concession,
 * ZOPA detection) against this on scenarios A, B and C. If the real engine
 * cannot beat a fixed 20%-of-the-gap concession on rounds-to-agreement and on
 * utility captured, then the engine is not earning its place in the
 * submission. So this file is a measuring stick, not scaffolding to delete.
 *
 * Both sides share this module (DRY). They differ only in the DIRECTION they
 * concede and in which private limit bounds them, both of which come from the
 * `direction` and `limit` fields rather than from duplicated logic.
 *
 * All arithmetic is integer bigint micro-USDC. No floats: see
 * packages/shared/src/money-micro-usdc.ts for why that matters here.
 */

import { applyBasisPoints, maxMicro, minMicro } from "@parley/shared";
import type { MicroUsdc, Terms } from "@parley/shared";

/**
 * Which way this side moves as it concedes.
 * A buyer starts low and concedes UP; a seller starts high and concedes DOWN.
 */
export type ConcessionDirection = "UP" | "DOWN";

export interface BaselineStrategyConfig {
  readonly direction: ConcessionDirection;
  /** Opening ask. Buyer: optimistically low. Seller: optimistically high. */
  readonly openingUnitPriceMicroUsdc: MicroUsdc;
  /**
   * The private hard limit. Buyer: maximum payable. Seller: minimum sellable.
   * Phase 03 turns this into a properly enforced clamp; here it only bounds
   * the strategy's own arithmetic.
   */
  readonly limitUnitPriceMicroUsdc: MicroUsdc;
  /** Fraction of the remaining gap conceded per round, in basis points. */
  readonly concessionBasisPoints: number;
  /**
   * Buyer: the quantity it needs. Seller: the quantity it can supply.
   * These are different meanings, which is exactly why `quantityRole` exists.
   */
  readonly quantity: number;
  readonly quantityRole: QuantityRole;
  readonly terms: Terms;
}

/**
 * Whose quantity wins.
 *
 * The buyer states the requirement; the seller fills it, capped at capacity.
 * Without this distinction the seller counteroffers its whole inventory and
 * the two sides quote totals for different amounts of goods, which makes the
 * ladder incoherent to anyone reading it.
 */
export type QuantityRole = "REQUESTS" | "SUPPLIES";

/** Quantity this side should put on its next offer. */
export function resolveQuantity(
  config: BaselineStrategyConfig,
  counterpartyQuantity: number | null,
): number {
  if (config.quantityRole === "REQUESTS" || counterpartyQuantity === null) {
    return config.quantity;
  }
  // Supplier: meet the request, but never promise more than capacity.
  return Math.min(counterpartyQuantity, config.quantity);
}

/** Everything the strategy knew when it produced a message. Persisted. */
export interface BaselineDecisionState {
  readonly strategy: "fixed-concession-baseline";
  readonly direction: ConcessionDirection;
  readonly ownPreviousPrice: string | null;
  readonly counterpartyPrice: string | null;
  readonly concessionBasisPoints: number;
  readonly proposedPrice: string;
  readonly limitPrice: string;
  readonly limitWasBinding: boolean;
  readonly accepted: boolean;
  readonly acceptanceReason: AcceptanceDecision["reason"];
}

/**
 * Next price this side will PROPOSE. Note the word: propose.
 *
 * This deliberately does NOT enforce the owner's limit. It moves
 * `concessionBasisPoints` of the gap toward the counterparty and returns that,
 * even when the result breaches its own side's guardrail.
 *
 * That is not a bug, it is the architecture. The strategy proposes and
 * `clampOfferIntoBand` disposes. Two things follow, both wanted:
 *
 *   1. The clamp visibly fires. A strategy that pre-censored itself would make
 *      the guardrail look decorative, because it would never have to bite. The
 *      transcript would show a safety property that was never exercised.
 *   2. It is the same shape phase 05 needs. An LLM cannot be trusted to
 *      self-censor, so the enforcement point must be downstream of the
 *      proposer. Putting the strategy in the same position as the LLM means
 *      the clamp is tested by every scenario run, not only by the LLM path.
 *
 * `wouldBreachOwnLimit` is reported for the decision-state audit trail. It is
 * NOT used to modify the proposal.
 */
export function nextProposedPrice(
  config: BaselineStrategyConfig,
  ownPrevious: MicroUsdc | null,
  counterparty: MicroUsdc | null,
): { price: MicroUsdc; limitWasBinding: boolean } {
  if (ownPrevious === null) {
    return { price: config.openingUnitPriceMicroUsdc, limitWasBinding: false };
  }
  if (counterparty === null) {
    return { price: ownPrevious, limitWasBinding: false };
  }

  const gap = counterparty - ownPrevious;
  const step = applyBasisPoints(gap, config.concessionBasisPoints);
  const moved = ownPrevious + step;

  const wouldBreachOwnLimit =
    config.direction === "UP"
      ? moved > config.limitUnitPriceMicroUsdc
      : moved < config.limitUnitPriceMicroUsdc;

  return { price: moved, limitWasBinding: wouldBreachOwnLimit };
}

/** Gap at or under this fraction of the price counts as converged. */
const NEGLIGIBLE_GAP_BASIS_POINTS = 200; // 2%

export interface AcceptanceDecision {
  readonly accept: boolean;
  readonly reason:
    | "AT_LEAST_AS_GOOD_AS_OUR_NEXT"
    | "GAP_NEGLIGIBLE"
    | "LAST_ROUND_AND_ACCEPTABLE"
    | "OUTSIDE_OUR_LIMIT"
    | "STILL_WORTH_COUNTERING";
}

/**
 * Should we accept their price rather than counter?
 *
 * The first gate is absolute: a price outside our own limit is never
 * acceptable, no matter how few rounds remain. That is what makes scenario C
 * end in a walk-away instead of a bad deal.
 *
 * Past that gate there are three ways to say yes:
 *
 *   1. Their price is already at least as good as what we were about to
 *      propose. Countering would argue us into a worse deal.
 *   2. The remaining gap is negligible. Two sides conceding a fixed fraction
 *      of the gap approach each other geometrically and, without this, would
 *      converge forever without ever crossing.
 *   3. It is the last round and their price is acceptable. Walking away from
 *      a deal that clears our limit, purely because the clock ran out, is
 *      worse than taking it.
 */
export function evaluateAcceptance(input: {
  direction: ConcessionDirection;
  counterpartyPrice: MicroUsdc;
  ourNextPrice: MicroUsdc;
  ourLimit: MicroUsdc;
  roundsRemaining: number;
}): AcceptanceDecision {
  const { direction, counterpartyPrice, ourNextPrice, ourLimit } = input;

  const withinOurLimit =
    direction === "UP"
      ? counterpartyPrice <= ourLimit
      : counterpartyPrice >= ourLimit;
  if (!withinOurLimit) {
    return { accept: false, reason: "OUTSIDE_OUR_LIMIT" };
  }

  const atLeastAsGood =
    direction === "UP"
      ? counterpartyPrice <= ourNextPrice
      : counterpartyPrice >= ourNextPrice;
  if (atLeastAsGood) {
    return { accept: true, reason: "AT_LEAST_AS_GOOD_AS_OUR_NEXT" };
  }

  const rawGap = counterpartyPrice - ourNextPrice;
  const gap = rawGap < 0n ? -rawGap : rawGap;
  const threshold = applyBasisPoints(
    counterpartyPrice,
    NEGLIGIBLE_GAP_BASIS_POINTS,
  );
  if (gap <= threshold) {
    return { accept: true, reason: "GAP_NEGLIGIBLE" };
  }

  if (input.roundsRemaining <= 0) {
    return { accept: true, reason: "LAST_ROUND_AND_ACCEPTABLE" };
  }

  return { accept: false, reason: "STILL_WORTH_COUNTERING" };
}
