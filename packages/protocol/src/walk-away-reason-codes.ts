/**
 * Why a negotiation ended without a deal.
 *
 * Every walk-away carries one of these plus a human-readable explanation
 * (spec section 6). The code is what the dashboard groups on and what the
 * post-mortem asserts against; the prose is for the audience.
 *
 * Phase 04 populates the ZOPA and utility codes. Phase 02 only ever emits
 * ROUND_CAP_REACHED, because the baseline strategy has no notion of a
 * reservation value.
 */

export const WALK_AWAY_REASONS = [
  /** Turn loop hit the hard round cap. Emitted by the loop, not by an agent. */
  "ROUND_CAP_REACHED",
  /** Reservation prices cannot overlap: no price can satisfy both sides. */
  "NO_ZOPA_PRICE",
  /** Seller capacity cannot meet the buyer's minimum quantity. */
  "NO_ZOPA_QUANTITY",
  /** Feasible unit price times required quantity exceeds the buyer's budget. */
  "NO_ZOPA_BUDGET",
  /** Best available deal scores below this side's reservation utility. */
  "UTILITY_BELOW_RESERVATION",
  /** Counterparty stopped conceding meaningfully; continuing is pointless. */
  "COUNTERPARTY_STALLED",
] as const;

export type WalkAwayReason = (typeof WALK_AWAY_REASONS)[number];

/** Audience-facing one-liner for each code, used by the dashboard. */
export const WALK_AWAY_REASON_DESCRIPTIONS: Record<WalkAwayReason, string> = {
  ROUND_CAP_REACHED: "Ran out of rounds before converging",
  NO_ZOPA_PRICE: "No price satisfies both sides' limits",
  NO_ZOPA_QUANTITY: "Seller cannot supply the buyer's minimum quantity",
  NO_ZOPA_BUDGET: "Any feasible price exceeds the buyer's total budget",
  UTILITY_BELOW_RESERVATION: "Best available deal is worse than no deal",
  COUNTERPARTY_STALLED: "Counterparty stopped making real concessions",
};
