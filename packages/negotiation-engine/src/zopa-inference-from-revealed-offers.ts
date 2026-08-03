/**
 * AGENT-SIDE ZOPA inference. Revealed information only.
 *
 * The spec pulls in two directions: section 5 wants early walk-away when no
 * agreement is possible, section 3 forbids either side from seeing the other's
 * reservation values. This module is the honest resolution. It sees exactly
 * what the counterparty published on the wire, extrapolates their concession
 * trend, and asks one question: could their trajectory ever reach my band?
 *
 * It is inference, not knowledge. It can be wrong, and being wrong is
 * realistic. The safeguards below exist so it cannot be wrong in the way that
 * would wreck the demo, which is firing on round 1 and walking away from a
 * perfectly good deal.
 *
 * The observer-side oracle (`zopa-oracle-for-observers.ts`) knows the truth.
 * No agent may import it, and a test enforces that.
 */

import type { MicroUsdc } from "@parley/shared";
import type { NegotiationState } from "./negotiation-state-types.js";

export interface ZopaInferenceResult {
  readonly hopeless: boolean;
  /** Where we project the counterparty ends up by the deadline. */
  readonly projectedCounterpartyFloor: MicroUsdc | null;
  readonly reason: string;
  readonly observationsUsed: number;
}

/**
 * Minimum counterparty offers before this may fire.
 *
 * Two observations give a slope but no evidence it is stable; firing on that
 * would walk away from scenario A on round 2. Three is the smallest number
 * that can show a trend continuing.
 */
export const MIN_OBSERVATIONS_BEFORE_INFERENCE = 3;

/**
 * How far past our own edge their projection must land before we give up.
 * Without a margin, ordinary extrapolation noise triggers a walk-away.
 */
export const ZOPA_CONFIDENCE_MARGIN_BASIS_POINTS = 500; // 5%

/**
 * Inference may not fire before this fraction of the round budget is spent.
 *
 * Both sides run back-loaded concession curves: they concede little early and
 * a lot late, on purpose, because that is what makes a negotiation watchable.
 * Judging a back-loaded negotiator in the first few rounds is therefore
 * meaningless, and doing so walked away from every scenario at round 3 during
 * development, including the two with a perfectly good ZOPA.
 */
export const MIN_PROGRESS_BEFORE_INFERENCE = 0.7;

/**
 * How much future acceleration to credit the counterparty with.
 *
 * A straight line drawn through the early part of a convex curve always
 * under-projects where that curve ends up. Rather than fit the curve, which
 * would mean assuming a functional form for the counterparty (and we
 * deliberately refuse to assume our own is knowable, so assuming theirs would
 * be inconsistent), we simply give them credit for conceding faster later.
 * Erring generous here is the safe direction: the cost of being wrong is a few
 * wasted rounds, whereas the cost of a false walk-away is a lost deal.
 */
export const CONCESSION_ACCELERATION_ALLOWANCE = 2.5;

/**
 * Inference may not fire in the endgame.
 *
 * With only a round or two left there is nothing to save by quitting early,
 * and the deadline accept rule may still close a deal that a projection said
 * was out of reach. Walking away here is strictly worse than playing it out:
 * it converts a possible deal into a certain no-deal to save one round.
 *
 * This is what stopped scenario B from abandoning a real, narrow ZOPA on the
 * second-to-last round.
 */
export const MIN_ROUNDS_REMAINING_FOR_INFERENCE = 3;

/**
 * Project the counterparty's final price by linear extrapolation of their
 * last observations, then test it against our own band edge.
 *
 * `ownBandEdge` is OUR limit: the buyer's maximum payable, or the seller's
 * derived floor. It never leaves this function.
 */
export function inferZopaHopeless(input: {
  state: NegotiationState;
  /** "BUYER" projects the seller falling; "SELLER" projects the buyer rising. */
  selfParty: "BUYER" | "SELLER";
  ownBandEdgeMicroUsdc: MicroUsdc;
}): ZopaInferenceResult {
  const offers = input.state.counterpartyOffers;

  if (offers.length < MIN_OBSERVATIONS_BEFORE_INFERENCE) {
    return {
      hopeless: false,
      projectedCounterpartyFloor: null,
      reason: `only ${offers.length} counterparty offers observed, need ${MIN_OBSERVATIONS_BEFORE_INFERENCE}`,
      observationsUsed: offers.length,
    };
  }

  const roundsRemaining = input.state.roundCap - input.state.round;
  if (roundsRemaining < MIN_ROUNDS_REMAINING_FOR_INFERENCE) {
    return {
      hopeless: false,
      projectedCounterpartyFloor: null,
      reason:
        `only ${roundsRemaining} rounds left; play it out rather than ` +
        `quitting on a projection`,
      observationsUsed: offers.length,
    };
  }

  const progress = input.state.round / Math.max(1, input.state.roundCap);
  if (progress < MIN_PROGRESS_BEFORE_INFERENCE) {
    return {
      hopeless: false,
      projectedCounterpartyFloor: null,
      reason:
        `only ${Math.round(progress * 100)}% through the round budget; ` +
        `too early to judge a back-loaded negotiator`,
      observationsUsed: offers.length,
    };
  }

  // Average recent per-round movement, using the last three observations.
  const recent = offers.slice(-3);
  const firstRecent = recent[0] as MicroUsdc;
  const lastRecent = recent[recent.length - 1] as MicroUsdc;
  const steps = BigInt(recent.length - 1);
  const perRound = steps === 0n ? 0n : (lastRecent - firstRecent) / steps;

  const roundsLeft = BigInt(
    Math.max(0, input.state.roundCap - input.state.round),
  );

  // Credit them with accelerating. See CONCESSION_ACCELERATION_ALLOWANCE.
  const allowance = BigInt(Math.round(CONCESSION_ACCELERATION_ALLOWANCE * 100));
  const projected = lastRecent + (perRound * roundsLeft * allowance) / 100n;

  // Margin applied in our own favour, so we only give up when the projection
  // misses our edge by a clear distance rather than by rounding.
  const edge = input.ownBandEdgeMicroUsdc;
  const margin =
    (edge * BigInt(ZOPA_CONFIDENCE_MARGIN_BASIS_POINTS)) / 10_000n;

  // A buyer needs the seller to come DOWN to at most its ceiling.
  // A seller needs the buyer to come UP to at least its floor.
  const hopeless =
    input.selfParty === "BUYER"
      ? projected > edge + margin
      : projected < edge - margin;

  return {
    hopeless,
    projectedCounterpartyFloor: projected,
    reason: hopeless
      ? `counterparty trend projects to ${projected} by round ${input.state.roundCap}, ` +
        `which cannot reach my limit of ${edge}`
      : `counterparty trend projects to ${projected}, still reachable`,
    observationsUsed: recent.length,
  };
}
