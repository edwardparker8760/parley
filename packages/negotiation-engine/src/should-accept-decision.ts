/**
 * Accept, or keep negotiating?
 *
 * Accept when what is on the table is at least as good as what we could still
 * realistically reach in the rounds remaining. "Realistically reachable"
 * reuses the concession curve rather than inventing a second notion of it, so
 * the accept decision and the offer decision cannot disagree.
 *
 * Utility is compared only against OUR OWN utility on OUR OWN scale. Comparing
 * utilities across sides would be meaningless: they are normalised against
 * different private bounds.
 *
 * This decides only whether we WANT the deal. Whether we are ALLOWED to take it
 * is a separate question answered by the phase 03 band check on ACCEPT, which
 * runs afterwards and can still refuse.
 */

import type { MicroUsdc } from "@parley/shared";

export interface AcceptDecision {
  readonly accept: boolean;
  readonly reason:
    | "BETTER_THAN_REACHABLE"
    | "DEADLINE_AND_ACCEPTABLE"
    | "WORSE_THAN_REACHABLE"
    | "BELOW_MIN_UTILITY";
  readonly inboundUtility: number;
  readonly reachableUtility: number;
}

export function shouldAcceptOffer(input: {
  /** Our utility for what they just offered. */
  inboundUtility: number;
  /** Our utility for the offer we were about to make instead. */
  reachableUtility: number;
  /** Owner's floor on acceptable utility, if set. */
  minAcceptableUtility: number;
  roundsRemaining: number;
  /** True when their price sits inside our band at all. */
  withinOwnBand: boolean;
}): AcceptDecision {
  const base = {
    inboundUtility: input.inboundUtility,
    reachableUtility: input.reachableUtility,
  };

  if (!input.withinOwnBand) {
    return { accept: false, reason: "WORSE_THAN_REACHABLE", ...base };
  }
  if (input.inboundUtility < input.minAcceptableUtility) {
    return { accept: false, reason: "BELOW_MIN_UTILITY", ...base };
  }
  if (input.inboundUtility >= input.reachableUtility) {
    return { accept: true, reason: "BETTER_THAN_REACHABLE", ...base };
  }
  // Out of road: a deal clearing our limits beats walking away with nothing.
  if (input.roundsRemaining <= 0) {
    return { accept: true, reason: "DEADLINE_AND_ACCEPTABLE", ...base };
  }
  return { accept: false, reason: "WORSE_THAN_REACHABLE", ...base };
}

/** Convenience: is this price inside [lo, hi] with hi possibly unbounded? */
export function priceWithin(
  price: MicroUsdc,
  lo: MicroUsdc,
  hi: MicroUsdc | null,
): boolean {
  if (price < lo) return false;
  if (hi !== null && price > hi) return false;
  return true;
}
