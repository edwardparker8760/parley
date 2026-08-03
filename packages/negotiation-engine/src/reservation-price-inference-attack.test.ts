/**
 * EXPLOITABILITY. Can a counterparty read our private walk-away price off our
 * public offers?
 *
 * This suite runs the inversion attack against both concession modes and
 * measures how close the attacker gets. It is written to FAIL if the defended
 * schedule ever becomes invertible again, which is the realistic regression:
 * someone simplifies the schedule, the ladder still looks fine on screen, and
 * the leak comes back silently.
 *
 * The naive test is not decoration. It establishes that the attack is real and
 * that the measurement instrument works, so the defended result means
 * something.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  computeConcessionTarget,
  type ConcessionMode,
} from "./time-dependent-concession-schedule.js";
import {
  inferReservationPrice,
  inferenceRelativeError,
} from "./reservation-price-inference-attack.js";
import type { ObservedOffer } from "./reservation-price-inference-attack.js";
import { createSeededRandom } from "./seeded-random.js";

const ROUND_CAP = 12;

/** Play out one side's offer sequence under a given mode. */
function generateOfferSequence(input: {
  mode: ConcessionMode;
  aspiration: bigint;
  reservation: bigint;
  beta: number;
  seed: number;
  /** How much the counterparty concedes each round, for the reciprocity term. */
  counterpartyConcessionRatio: number;
}): ObservedOffer[] {
  const random = createSeededRandom(input.seed);
  const offers: ObservedOffer[] = [];

  for (let round = 1; round <= ROUND_CAP; round += 1) {
    const { targetMicroUsdc } = computeConcessionTarget({
      round,
      roundCap: ROUND_CAP,
      aspirationMicroUsdc: input.aspiration,
      reservationMicroUsdc: input.reservation,
      beta: input.beta,
      counterpartyConcessionRatio: input.counterpartyConcessionRatio,
      random,
      mode: input.mode,
    });
    offers.push({ round, unitPriceMicroUsdc: targetMicroUsdc });
  }

  return offers;
}

/** A spread of realistic private limits to attack. */
const CASES = [
  { aspiration: 500n, reservation: 1200n },
  { aspiration: 400n, reservation: 900n },
  { aspiration: 1500n, reservation: 760n },
  { aspiration: 2000n, reservation: 950n },
  { aspiration: 300n, reservation: 1800n },
  { aspiration: 1200n, reservation: 600n },
];

function medianErrorFor(mode: ConcessionMode): number {
  const errors: number[] = [];

  for (const [index, testCase] of CASES.entries()) {
    for (const beta of [1.5, 2.0, 2.5]) {
      const offers = generateOfferSequence({
        mode,
        aspiration: testCase.aspiration,
        reservation: testCase.reservation,
        beta,
        seed: 1000 + index * 17 + Math.round(beta * 10),
        counterpartyConcessionRatio: 0.3,
      });

      const inference = inferReservationPrice(offers, ROUND_CAP);
      assert.ok(inference !== null, "attacker produced no estimate at all");
      errors.push(
        inferenceRelativeError(
          inference.inferredReservationMicroUsdc,
          testCase.reservation,
        ),
      );
    }
  }

  errors.sort((a, b) => a - b);
  const middle = Math.floor(errors.length / 2);
  return errors[middle] ?? Number.POSITIVE_INFINITY;
}

test("ATTACK BASELINE: the naive schedule leaks the reservation price", () => {
  // Establishes that the vulnerability is real and the instrument works.
  // If this ever starts passing with a large error, the attack has broken,
  // not the defence improved, and the defended assertion below means nothing.
  const error = medianErrorFor("NAIVE_TIME_DEPENDENT");

  assert.ok(
    error < 0.02,
    `expected the naive schedule to leak the reservation to within 2%, ` +
      `attacker was off by ${(error * 100).toFixed(2)}%. If this fails the ` +
      `attack implementation is broken and the defended result is meaningless.`,
  );
});

test("DEFENCE: the defended schedule does not leak the reservation price", () => {
  const naiveError = medianErrorFor("NAIVE_TIME_DEPENDENT");
  const defendedError = medianErrorFor("DEFENDED");

  // The attacker must be materially worse off. 15% error on a reservation
  // price is enough that squeezing to "one unit inside" is no longer possible:
  // the attacker either leaves surplus on the table or oversteps and gets
  // refused by the victim's clamp.
  assert.ok(
    defendedError > 0.15,
    `defended schedule leaked the reservation to within ` +
      `${(defendedError * 100).toFixed(2)}%, which is close enough to exploit`,
  );

  // And it must be a large improvement, not a rounding difference.
  assert.ok(
    defendedError > naiveError * 10,
    `defended error ${(defendedError * 100).toFixed(2)}% is not a meaningful ` +
      `improvement over naive ${(naiveError * 100).toFixed(2)}%`,
  );
});

test("DEFENCE: the attacker cannot even tell which model fits", () => {
  // Beyond getting the number wrong, the attacker should have no confident
  // model to act on. Low spread means "I have found the curve"; the defended
  // schedule must not offer one.
  let naiveConfident = 0;
  let defendedConfident = 0;

  for (const [index, testCase] of CASES.entries()) {
    for (const mode of ["NAIVE_TIME_DEPENDENT", "DEFENDED"] as const) {
      const offers = generateOfferSequence({
        mode,
        aspiration: testCase.aspiration,
        reservation: testCase.reservation,
        beta: 2.0,
        seed: 500 + index,
        counterpartyConcessionRatio: 0.3,
      });
      const inference = inferReservationPrice(offers, ROUND_CAP);
      assert.ok(inference !== null);
      // Spread under 1% means the attacker believes it has the exact curve.
      const confident = inference.relativeSpread < 0.01;
      if (mode === "NAIVE_TIME_DEPENDENT" && confident) naiveConfident += 1;
      if (mode === "DEFENDED" && confident) defendedConfident += 1;
    }
  }

  assert.equal(
    naiveConfident,
    CASES.length,
    "the attack should be confident against every naive case",
  );
  assert.equal(
    defendedConfident,
    0,
    "the attacker found a confident model against the defended schedule",
  );
});

test("DEFENCE: jitter stays reproducible for the same seed", () => {
  // The defence must not cost us demo reproducibility. Same seed, same ladder.
  const build = (seed: number): ObservedOffer[] =>
    generateOfferSequence({
      mode: "DEFENDED",
      aspiration: 500n,
      reservation: 1200n,
      beta: 2.0,
      seed,
      counterpartyConcessionRatio: 0.3,
    });

  assert.deepEqual(build(42), build(42), "same seed produced different offers");
  assert.notDeepEqual(
    build(42),
    build(43),
    "different seeds produced identical offers, so jitter is not applied",
  );
});

test("DEFENCE: the target never crosses the reservation price", () => {
  // Whatever the jitter does, it must never propose past our own limit. The
  // phase 03 clamp would catch it, but the schedule should not rely on that.
  const random = createSeededRandom(7);

  for (let round = 1; round <= ROUND_CAP; round += 1) {
    // Buyer shape: aspiration below reservation, conceding upward.
    const up = computeConcessionTarget({
      round,
      roundCap: ROUND_CAP,
      aspirationMicroUsdc: 500n,
      reservationMicroUsdc: 1200n,
      beta: 2,
      counterpartyConcessionRatio: 1,
      random,
      mode: "DEFENDED",
    });
    assert.ok(
      up.targetMicroUsdc <= 1200n,
      `round ${round}: buyer target ${up.targetMicroUsdc} passed its limit`,
    );
    assert.ok(up.targetMicroUsdc >= 500n, "buyer target went backwards");

    // Seller shape: aspiration above reservation, conceding downward.
    const down = computeConcessionTarget({
      round,
      roundCap: ROUND_CAP,
      aspirationMicroUsdc: 1500n,
      reservationMicroUsdc: 760n,
      beta: 2,
      counterpartyConcessionRatio: 1,
      random,
      mode: "DEFENDED",
    });
    assert.ok(
      down.targetMicroUsdc >= 760n,
      `round ${round}: seller target ${down.targetMicroUsdc} passed its floor`,
    );
    assert.ok(down.targetMicroUsdc <= 1500n, "seller target went backwards");
  }
});
