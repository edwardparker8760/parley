/**
 * Engine invariants: utility monotonicity, concession endpoints, ZOPA
 * detection, and the import-isolation rule that keeps the oracle away from
 * the agents.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { Offer, Terms } from "@parley/shared";
import type { BuyerGuardrails, SellerGuardrails } from "@parley/guardrails";

import { computeBuyerUtility } from "./buyer-utility-function.js";
import { computeSellerUtility } from "./seller-utility-function.js";
import { computeConcessionTarget } from "./time-dependent-concession-schedule.js";
import { computeTrueZopa } from "./zopa-oracle-for-observers.js";
import { createSeededRandom } from "./seeded-random.js";
import {
  inferZopaHopeless,
  MIN_OBSERVATIONS_BEFORE_INFERENCE,
} from "./zopa-inference-from-revealed-offers.js";
import { emptyState } from "./negotiation-state-types.js";

const TERMS: Terms = { deliveryWindowHours: 24, slaTier: "standard" };

const BUYER: BuyerGuardrails = {
  party: "BUYER",
  maxUnitPriceMicroUsdc: 1200n,
  maxTotalSpendMicroUsdc: 12_000_000n,
  minQuantity: 1_000,
  targetQuantity: 10_000,
  minSlaTier: "basic",
  maxDeliveryWindowHours: 72,
  maxRounds: 12,
};

const SELLER: SellerGuardrails = {
  party: "SELLER",
  costBasisMicroUsdc: 500n,
  minMarginPct: 40,
  minQuantity: 1_000,
  availableQuantity: 20_000,
  maxSlaTier: "premium",
  minDeliveryWindowHours: 12,
  maxRounds: 12,
};

function offer(price: bigint, quantity = 10_000, terms = TERMS): Offer {
  return { unitPriceMicroUsdc: price, quantity, terms };
}

test("buyer utility strictly decreases as price rises", () => {
  let previous = Number.POSITIVE_INFINITY;
  for (let price = 100n; price <= 1200n; price += 100n) {
    const utility = computeBuyerUtility(BUYER, offer(price));
    assert.ok(
      utility < previous,
      `buyer utility did not fall from ${previous} at price ${price}`,
    );
    previous = utility;
  }
});

test("buyer utility rises with quantity up to target", () => {
  let previous = Number.NEGATIVE_INFINITY;
  for (let quantity = 1_000; quantity <= 10_000; quantity += 1_000) {
    const utility = computeBuyerUtility(BUYER, offer(500n, quantity));
    assert.ok(
      utility > previous,
      `buyer utility did not rise at quantity ${quantity}`,
    );
    previous = utility;
  }
});

test("seller utility increases as price rises, then saturates", () => {
  // The margin component is normalised against a synthetic ceiling of twice
  // the derived floor, so it deliberately saturates above that. Saturation is
  // correct: past a point, more margin stops changing the decision. Below the
  // ceiling the utility must be strictly increasing, which is the property the
  // concession logic actually relies on.
  const floorAtTerms = 756n; // ceil(500 * 1.08 * 1.40)
  const marginCeiling = floorAtTerms * 2n;

  let previous = Number.NEGATIVE_INFINITY;
  for (let price = 800n; price < marginCeiling; price += 100n) {
    const utility = computeSellerUtility(SELLER, offer(price));
    assert.ok(
      utility > previous,
      `seller utility did not rise at price ${price} (below the ceiling)`,
    );
    previous = utility;
  }

  // Above the ceiling it must never DECREASE, which would be perverse.
  let atCeiling = computeSellerUtility(SELLER, offer(marginCeiling));
  for (let price = marginCeiling; price <= 4000n; price += 200n) {
    const utility = computeSellerUtility(SELLER, offer(price));
    assert.ok(
      utility >= atCeiling - 1e-9,
      `seller utility fell at price ${price}, above the saturation ceiling`,
    );
    atCeiling = utility;
  }
});

test("both utilities stay inside [0,1]", () => {
  for (let price = 0n; price <= 5000n; price += 250n) {
    const buyer = computeBuyerUtility(BUYER, offer(price));
    const seller = computeSellerUtility(SELLER, offer(price));
    for (const [label, value] of [
      ["buyer", buyer],
      ["seller", seller],
    ] as const) {
      assert.ok(
        value >= 0 && value <= 1,
        `${label} utility ${value} outside [0,1] at price ${price}`,
      );
    }
  }
});

test("concession schedule stays between aspiration and reservation", () => {
  const random = createSeededRandom(1);
  for (let round = 1; round <= 12; round += 1) {
    const { targetMicroUsdc, alpha } = computeConcessionTarget({
      round,
      roundCap: 12,
      aspirationMicroUsdc: 500n,
      reservationMicroUsdc: 1200n,
      beta: 2,
      counterpartyConcessionRatio: 0.5,
      random,
      mode: "DEFENDED",
    });
    assert.ok(alpha >= 0 && alpha <= 1, `alpha ${alpha} outside [0,1]`);
    assert.ok(targetMicroUsdc >= 500n && targetMicroUsdc <= 1200n);
  }
});

test("naive schedule hits both endpoints exactly", () => {
  const random = createSeededRandom(1);
  const at = (round: number): bigint =>
    computeConcessionTarget({
      round,
      roundCap: 12,
      aspirationMicroUsdc: 500n,
      reservationMicroUsdc: 1200n,
      beta: 2,
      counterpartyConcessionRatio: 0,
      random,
      mode: "NAIVE_TIME_DEPENDENT",
    }).targetMicroUsdc;

  // At the deadline the naive curve sits exactly on the reservation. That is
  // precisely the property the inference attack exploits.
  assert.equal(at(12), 1200n);
  assert.ok(at(1) < 520n, "naive curve should barely move on round 1");
});

test("ZOPA oracle detects overlap and its absence", () => {
  const overlapping = computeTrueZopa(BUYER, SELLER, 10_000, TERMS);
  assert.equal(overlapping.exists, true);
  assert.equal(overlapping.loMicroUsdc, 756n);
  assert.equal(overlapping.hiMicroUsdc, 1200n);

  // Scenario C shape: buyer ceiling below the seller's derived floor.
  const tightBuyer: BuyerGuardrails = {
    ...BUYER,
    maxUnitPriceMicroUsdc: 600n,
    maxTotalSpendMicroUsdc: 6_000_000n,
  };
  const expensiveSeller: SellerGuardrails = {
    ...SELLER,
    costBasisMicroUsdc: 800n,
    minMarginPct: 10,
  };
  const disjoint = computeTrueZopa(
    tightBuyer,
    expensiveSeller,
    10_000,
    TERMS,
  );
  assert.equal(disjoint.exists, false);
  assert.match(String(disjoint.blockingCause), /no price satisfies both/);
});

test("ZOPA inference will not fire before it has evidence", () => {
  // Firing early walked away from every scenario during development,
  // including the two with a perfectly good ZOPA.
  const state = {
    ...emptyState(2, 12),
    counterpartyOffers: [1500n, 1480n],
  };
  const result = inferZopaHopeless({
    state,
    selfParty: "BUYER",
    ownBandEdgeMicroUsdc: 600n,
  });
  assert.equal(result.hopeless, false);
  assert.ok(state.counterpartyOffers.length < MIN_OBSERVATIONS_BEFORE_INFERENCE);
});

test("ZOPA inference will not fire in the endgame", () => {
  const state = {
    ...emptyState(11, 12),
    counterpartyOffers: [1500n, 1480n, 1460n, 1440n],
  };
  const result = inferZopaHopeless({
    state,
    selfParty: "BUYER",
    ownBandEdgeMicroUsdc: 600n,
  });
  assert.equal(
    result.hopeless,
    false,
    "quitting with two rounds left throws away a deal the deadline rule may close",
  );
});

test("NO AGENT MAY IMPORT THE ZOPA ORACLE", () => {
  // The credibility of the whole information-asymmetry claim rests on this.
  // It is easy to break by accident and impossible to notice in a demo, which
  // is why it is a test rather than a convention.
  const roots = [
    join(process.cwd(), "..", "agents", "src"),
    join(process.cwd(), "src"),
  ];

  const offenders: string[] = [];

  function scan(directory: string): void {
    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) {
        scan(full);
        continue;
      }
      if (!full.endsWith(".ts")) continue;
      // The oracle itself, and this test, are allowed to name it.
      if (full.includes("zopa-oracle-for-observers")) continue;
      if (full.includes("engine-invariants.test")) continue;

      const source = readFileSync(full, "utf8");
      // Only flag real imports, not prose in a comment warning about it.
      const importsOracle =
        /^\s*import[^;]*zopa-oracle-for-observers/m.test(source) ||
        /^\s*import[^;]*negotiation-engine\/oracle/m.test(source);
      if (importsOracle) offenders.push(full);
    }
  }

  for (const root of roots) scan(root);

  assert.deepEqual(
    offenders,
    [],
    `these agent-side files import the ZOPA oracle and can therefore see the ` +
      `counterparty's private limits: ${offenders.join(", ")}`,
  );
});
