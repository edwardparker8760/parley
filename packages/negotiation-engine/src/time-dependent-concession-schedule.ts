/**
 * How far this side concedes on a given round.
 *
 * ## The exploitability problem, and why this module has two modes
 *
 * The textbook Faratin time-dependent schedule is:
 *
 *     target(t) = aspiration + (t/T)^beta * (reservation - aspiration)
 *
 * It is clean, it produces the back-loaded ladder that makes a demo watchable,
 * and it **leaks the reservation price outright**. Everything on the right
 * except `reservation` is either public or guessable: `aspiration` is the
 * opening offer, which is revealed on round 1; `t` and `T` are visible to
 * both sides; `beta` is a small constant an attacker can grid-search. So a
 * counterparty can rearrange a SINGLE observed offer:
 *
 *     reservation = aspiration + (target(t) - aspiration) / (t/T)^beta
 *
 * and read the opposing owner's private limit straight off the wire. It can
 * then hold exactly one micro-unit inside that limit and capture the entire
 * surplus. In the Agentic Economy track this is the obvious attack, and
 * "our agents negotiate on your behalf" is not a product if the counterparty
 * can compute your walk-away price from your second message.
 *
 * `NAIVE_TIME_DEPENDENT` implements the vulnerable form. It exists so
 * `reservation-price-inference-attack.test.ts` can demonstrate the leak
 * quantitatively rather than assert it.
 *
 * ## The defence
 *
 * `DEFENDED` keeps the same visible shape (back-loaded, converging, legible)
 * while breaking the inversion three ways:
 *
 *   1. **Reciprocity.** Part of the step size is a function of how much the
 *      COUNTERPARTY has just conceded, not of our own distance to our limit.
 *      This is also just better negotiation: it refuses to keep conceding to
 *      someone who has stopped moving.
 *   2. **Seeded jitter.** The time exponent is perturbed per round by a
 *      private seeded PRNG. Deterministic for us, unpredictable for them.
 *      Because the inversion divides by `(t/T)^beta`, a small perturbation
 *      early in the negotiation produces a large error in the inferred
 *      reservation, which is exactly where an attacker most wants to know it.
 *   3. **Aspiration floor.** The target never goes past a floor held strictly
 *      inside our own band, so the curve does not asymptotically pin itself to
 *      the reservation and hand it over at the deadline.
 *
 * The clamp from phase 03 still sits downstream of all of this. Nothing here
 * can produce an illegal offer; the worst a bug could do is make us negotiate
 * badly, not unsafely.
 */

import type { MicroUsdc } from "@parley/shared";

export type ConcessionMode = "NAIVE_TIME_DEPENDENT" | "DEFENDED";

export interface ConcessionInputs {
  /** 1-based round. */
  readonly round: number;
  readonly roundCap: number;
  /** Our opening ask. Revealed publicly on round 1. */
  readonly aspirationMicroUsdc: MicroUsdc;
  /** Our private walk-away price. Must never be inferable from our offers. */
  readonly reservationMicroUsdc: MicroUsdc;
  /** Back-loading exponent. > 1 concedes late. */
  readonly beta: number;
  /**
   * How much the counterparty conceded last round, as a fraction of their own
   * opening-to-current span. 0 when they have not moved or are unknown.
   */
  readonly counterpartyConcessionRatio: number;
  /** Injected, seeded. Returns [0,1). */
  readonly random: () => number;
  readonly mode: ConcessionMode;
}

export interface ConcessionOutput {
  readonly targetMicroUsdc: MicroUsdc;
  /** Effective progress along aspiration -> reservation, in [0,1]. */
  readonly alpha: number;
  readonly mode: ConcessionMode;
}

/** Fraction of the step driven by reciprocity rather than by the clock. */
const RECIPROCITY_WEIGHT = 0.35;

/** Maximum relative perturbation applied to the time term. */
const JITTER_MAGNITUDE = 0.22;

/**
 * The target never travels further than this fraction of the way to the
 * reservation, so the curve cannot converge onto the limit and reveal it.
 * The remaining distance is only ever crossed by an explicit accept decision.
 */
const ASPIRATION_FLOOR_FRACTION = 0.92;

function interpolate(
  aspiration: MicroUsdc,
  reservation: MicroUsdc,
  alpha: number,
): MicroUsdc {
  const span = reservation - aspiration;
  // Scale to integer basis points before multiplying, so no float touches the
  // money value itself.
  const alphaBp = BigInt(Math.round(alpha * 1_000_000));
  return aspiration + (span * alphaBp) / 1_000_000n;
}

export function computeConcessionTarget(
  inputs: ConcessionInputs,
): ConcessionOutput {
  const progress = Math.min(
    1,
    Math.max(0, inputs.round / Math.max(1, inputs.roundCap)),
  );

  const timeAlpha = Math.pow(progress, inputs.beta);

  if (inputs.mode === "NAIVE_TIME_DEPENDENT") {
    // Deliberately invertible. See the module comment.
    return {
      targetMicroUsdc: interpolate(
        inputs.aspirationMicroUsdc,
        inputs.reservationMicroUsdc,
        timeAlpha,
      ),
      alpha: timeAlpha,
      mode: inputs.mode,
    };
  }

  // 1. Reciprocity: blend the clock with what they actually did.
  const reciprocalAlpha = Math.min(
    1,
    Math.max(0, inputs.counterpartyConcessionRatio),
  );
  const blended =
    (1 - RECIPROCITY_WEIGHT) * timeAlpha + RECIPROCITY_WEIGHT * reciprocalAlpha;

  // 2. Seeded jitter, symmetric around the blended value.
  const jitter = (inputs.random() * 2 - 1) * JITTER_MAGNITUDE;
  const jittered = blended * (1 + jitter);

  // 3. Aspiration floor: never travel the whole way to the reservation.
  const bounded = Math.min(
    ASPIRATION_FLOOR_FRACTION,
    Math.max(0, jittered),
  );

  return {
    targetMicroUsdc: interpolate(
      inputs.aspirationMicroUsdc,
      inputs.reservationMicroUsdc,
      bounded,
    ),
    alpha: bounded,
    mode: inputs.mode,
  };
}

/**
 * Best price this side could still realistically reach by the deadline.
 * Used by the accept decision, so it reuses the same curve rather than
 * inventing a second notion of "reachable".
 */
export function projectedBestReachable(
  inputs: Omit<ConcessionInputs, "round"> & { readonly roundsRemaining: number },
): MicroUsdc {
  return computeConcessionTarget({
    ...inputs,
    round: inputs.roundCap - inputs.roundsRemaining,
  }).targetMicroUsdc;
}
