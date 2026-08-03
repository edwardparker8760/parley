/**
 * RED TEAM. An attacker that tries to read a counterparty's private walk-away
 * price off its public offers.
 *
 * This is the question a judge in the Agentic Economy track will ask: can one
 * agent game the other? If an agent's concession size is a fixed function of
 * its distance to its own limit, then yes, trivially. The counterparty
 * observes offers, assumes the functional form, and solves for the limit.
 *
 * Against the naive Faratin schedule the inversion is exact:
 *
 *     target(t) = aspiration + (t/T)^beta * (reservation - aspiration)
 *  => reservation = aspiration + (target(t) - aspiration) / (t/T)^beta
 *
 * `aspiration` is the opening offer, revealed on round 1. `t` and `T` are
 * public. `beta` is a single small constant, so the attacker grid-searches it
 * and keeps whichever value makes its estimates most self-consistent across
 * rounds. Consistency is the giveaway: with the true beta every observation
 * yields the same reservation, so the variance collapses to zero.
 *
 * This module is shipped, not deleted, because it is the measurement
 * instrument for the defence. `reservation-price-inference-attack.test.ts`
 * runs it against both schedule modes and asserts the defended one cannot be
 * pinned down.
 */

import type { MicroUsdc } from "@parley/shared";

export interface ObservedOffer {
  /** 1-based round the offer was made on. */
  readonly round: number;
  readonly unitPriceMicroUsdc: MicroUsdc;
}

export interface InferenceResult {
  /** Best guess at the counterparty's reservation price. */
  readonly inferredReservationMicroUsdc: MicroUsdc;
  /** beta the attacker settled on. */
  readonly assumedBeta: number;
  /**
   * Spread of the per-observation estimates, relative to their mean. Near zero
   * means the attacker found a consistent model and is confident. Large means
   * the observations do not fit any single curve.
   */
  readonly relativeSpread: number;
  readonly observationCount: number;
}

/** Betas an attacker would plausibly try. */
const BETA_GRID = [0.5, 0.8, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0];

/**
 * Ignore observations whose inversion denominator is below this. Early rounds
 * divide by a near-zero number and amplify integer truncation into noise, so a
 * real attacker discards them rather than averaging them in.
 */
const RELIABLE_DENOMINATOR_FLOOR = 0.05;

/**
 * Invert the concession curve to recover a reservation price.
 *
 * `observations` must be the counterparty's own offers in round order. The
 * first is treated as their aspiration, which is exactly the information they
 * publish on round 1.
 */
export function inferReservationPrice(
  observations: readonly ObservedOffer[],
  roundCap: number,
): InferenceResult | null {
  if (observations.length < 2) return null;

  const first = observations[0];
  if (first === undefined) return null;
  const aspiration = Number(first.unitPriceMicroUsdc);

  let best: InferenceResult | null = null;

  for (const beta of BETA_GRID) {
    const estimates: number[] = [];
    const weights: number[] = [];

    for (const observation of observations.slice(1)) {
      const progress = observation.round / roundCap;
      if (progress <= 0) continue;
      const denominator = Math.pow(progress, beta);

      // Discard numerically unreliable early observations. The inversion
      // divides by this denominator, so when it is tiny a single micro-unit
      // of integer truncation in the victim's offer explodes into a huge
      // error in the estimate. A competent attacker simply waits for the
      // observations that are worth using, which is what this filter models.
      // Without it the attack understates the leak and the defence looks
      // better than it is.
      if (denominator < RELIABLE_DENOMINATOR_FLOOR) continue;

      const estimate =
        aspiration +
        (Number(observation.unitPriceMicroUsdc) - aspiration) / denominator;
      if (!Number.isFinite(estimate)) continue;

      estimates.push(estimate);
      // Inverse-variance weighting. Each estimate's error is proportional to
      // 1/denominator, so its variance goes as 1/denominator^2 and its weight
      // as denominator^2. Late observations therefore dominate, which is
      // correct: they are the ones the arithmetic can actually be trusted on.
      weights.push(denominator * denominator);
    }

    if (estimates.length === 0) continue;

    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    if (weightTotal <= 0) continue;

    const mean =
      estimates.reduce(
        (sum, value, index) => sum + value * (weights[index] as number),
        0,
      ) / weightTotal;
    const variance =
      estimates.reduce(
        (sum, value, index) =>
          sum + (weights[index] as number) * (value - mean) ** 2,
        0,
      ) / weightTotal;
    const relativeSpread =
      Math.abs(mean) < 1e-9 ? Number.POSITIVE_INFINITY : Math.sqrt(variance) / Math.abs(mean);

    if (best === null || relativeSpread < best.relativeSpread) {
      best = {
        inferredReservationMicroUsdc: BigInt(Math.round(mean)),
        assumedBeta: beta,
        relativeSpread,
        observationCount: estimates.length,
      };
    }
  }

  return best;
}

/**
 * How badly the attacker did, as a fraction of the true value.
 *
 * 0 means the private limit was recovered exactly. This is the number the
 * exploitability test asserts on.
 */
export function inferenceRelativeError(
  inferred: MicroUsdc,
  actual: MicroUsdc,
): number {
  if (actual === 0n) return Number.POSITIVE_INFINITY;
  const difference = inferred > actual ? inferred - actual : actual - inferred;
  return Number(difference) / Number(actual);
}

/**
 * What the attacker would do with a successful inference: offer exactly one
 * micro-unit inside the victim's limit and capture the whole surplus.
 * Used to express the leak in money terms rather than as a percentage.
 */
export function exploitOfferAgainst(
  inferredReservation: MicroUsdc,
  attackerIsBuyer: boolean,
): MicroUsdc {
  return attackerIsBuyer ? inferredReservation : inferredReservation + 1n;
}
