/**
 * The three demo scenarios (spec section 8).
 *
 * The traded good is bulk inference capacity: the buyer needs N model calls,
 * the seller sells capacity at a unit price in micro-USDC per call. Circle's
 * own worked example prices an API call at $0.001, which is 1000 micro-USDC,
 * so these anchors sit either side of a realistic figure.
 *
 * Scenario C is the important one. It is the proof that the guardrails
 * genuinely bind: the two limits cannot overlap, so no agreement is possible
 * and both sides must walk away with no payment. It is non-negotiable and must
 * never be tuned into converging.
 */

import type { MicroUsdc, Terms } from "@parley/shared";

export type ScenarioName = "A" | "B" | "C";

export interface ScenarioDefinition {
  readonly name: ScenarioName;
  readonly label: string;
  readonly roundCap: number;
  readonly buyer: {
    readonly maxUnitPriceMicroUsdc: MicroUsdc;
    readonly openingUnitPriceMicroUsdc: MicroUsdc;
    readonly quantity: number;
    readonly terms: Terms;
  };
  readonly seller: {
    readonly minUnitPriceMicroUsdc: MicroUsdc;
    readonly openingUnitPriceMicroUsdc: MicroUsdc;
    readonly availableQuantity: number;
    readonly terms: Terms;
  };
  readonly expectation: string;
}

const STANDARD_TERMS: Terms = {
  deliveryWindowHours: 24,
  slaTier: "standard",
};

export const SCENARIOS: Record<ScenarioName, ScenarioDefinition> = {
  A: {
    name: "A",
    label: "Wide ZOPA",
    roundCap: 12,
    buyer: {
      maxUnitPriceMicroUsdc: 1200n,
      openingUnitPriceMicroUsdc: 500n,
      quantity: 10_000,
      terms: STANDARD_TERMS,
    },
    seller: {
      minUnitPriceMicroUsdc: 700n,
      openingUnitPriceMicroUsdc: 1500n,
      availableQuantity: 20_000,
      terms: STANDARD_TERMS,
    },
    // Overlap is [700, 1200], 500 wide. Should close comfortably.
    expectation: "Converges in a few rounds and settles",
  },
  B: {
    name: "B",
    label: "Narrow ZOPA",
    roundCap: 12,
    buyer: {
      maxUnitPriceMicroUsdc: 900n,
      openingUnitPriceMicroUsdc: 500n,
      quantity: 10_000,
      terms: STANDARD_TERMS,
    },
    seller: {
      minUnitPriceMicroUsdc: 860n,
      openingUnitPriceMicroUsdc: 1500n,
      availableQuantity: 11_000,
      terms: STANDARD_TERMS,
    },
    // Overlap is [860, 900], only 40 wide. Concessions have to be earned.
    expectation: "Converges late, after real concessions",
  },
  C: {
    name: "C",
    label: "No ZOPA",
    roundCap: 12,
    buyer: {
      maxUnitPriceMicroUsdc: 600n,
      openingUnitPriceMicroUsdc: 400n,
      quantity: 10_000,
      terms: STANDARD_TERMS,
    },
    seller: {
      minUnitPriceMicroUsdc: 950n,
      openingUnitPriceMicroUsdc: 1500n,
      availableQuantity: 20_000,
      terms: STANDARD_TERMS,
    },
    // Buyer cannot go above 600, seller cannot go below 950. No overlap
    // exists, so no price can ever satisfy both. Both must walk away.
    expectation: "Both walk away, no payment",
  },
};

export function isScenarioName(value: string): value is ScenarioName {
  return value === "A" || value === "B" || value === "C";
}
