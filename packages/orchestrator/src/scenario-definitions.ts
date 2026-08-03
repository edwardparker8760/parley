/**
 * The three demo scenarios (spec section 8), now carrying REAL owner guardrails.
 *
 * The traded good is bulk inference capacity: the buyer needs N model calls,
 * the seller sells capacity at a unit price in micro-USDC per call. Circle's
 * own worked example prices an API call at $0.001, which is 1000 micro-USDC,
 * so these anchors sit either side of a realistic figure.
 *
 * The seller's floor is NOT written here. It is derived from cost basis,
 * minimum margin, and the terms on the table, which is what makes the
 * non-price terms genuinely negotiable. The comments record the derived value
 * at standard terms so the bands are readable, but the arithmetic is the
 * authority.
 *
 * Scenario C is the important one. It is the proof that the guardrails
 * genuinely bind: the two bands cannot intersect, so no agreement is possible
 * and both sides must walk away with no payment. Never tune it into
 * converging.
 */

import type { MicroUsdc, Terms } from "@parley/shared";
import type { BuyerGuardrails, SellerGuardrails } from "@parley/guardrails";

export type ScenarioName = "A" | "B" | "C";

export interface ScenarioDefinition {
  readonly name: ScenarioName;
  readonly label: string;
  readonly roundCap: number;
  readonly buyerGuardrails: BuyerGuardrails;
  readonly sellerGuardrails: SellerGuardrails;
  readonly buyerOpeningMicroUsdc: MicroUsdc;
  readonly sellerOpeningMicroUsdc: MicroUsdc;
  readonly terms: Terms;
  readonly expectation: string;
}

/** Standard terms: 24h window, standard SLA. No cost uplift at these terms. */
const STANDARD_TERMS: Terms = {
  deliveryWindowHours: 24,
  slaTier: "standard",
};

const QUANTITY = 10_000;

export const SCENARIOS: Record<ScenarioName, ScenarioDefinition> = {
  A: {
    name: "A",
    label: "Wide ZOPA",
    roundCap: 12,
    // Buyer band [0, 1200]. Seller floor at standard terms:
    // ceil(500 * 10800/10000 * 140/100) = ceil(756) = 756.
    // Overlap [756, 1200] is roughly 444 wide. Should close comfortably.
    buyerGuardrails: {
      party: "BUYER",
      maxUnitPriceMicroUsdc: 1200n,
      maxTotalSpendMicroUsdc: 12_000_000n,
      minQuantity: 1_000,
      targetQuantity: QUANTITY,
      minSlaTier: "basic",
      maxDeliveryWindowHours: 72,
      maxRounds: 12,
    },
    sellerGuardrails: {
      party: "SELLER",
      costBasisMicroUsdc: 500n,
      minMarginPct: 40,
      minQuantity: 1_000,
      availableQuantity: 20_000,
      maxSlaTier: "premium",
      minDeliveryWindowHours: 12,
      maxRounds: 12,
    },
    buyerOpeningMicroUsdc: 500n,
    sellerOpeningMicroUsdc: 1500n,
    terms: STANDARD_TERMS,
    expectation: "Converges and settles",
  },
  B: {
    name: "B",
    label: "Narrow ZOPA",
    roundCap: 12,
    // Buyer band [0, 900]. Seller floor: ceil(700 * 10800/10000 * 113/100)
    // = ceil(854.3) = 855. Overlap [855, 900] is only 45 wide, so every
    // concession has to be earned.
    buyerGuardrails: {
      party: "BUYER",
      maxUnitPriceMicroUsdc: 900n,
      maxTotalSpendMicroUsdc: 9_000_000n,
      minQuantity: 1_000,
      targetQuantity: QUANTITY,
      minSlaTier: "basic",
      maxDeliveryWindowHours: 72,
      maxRounds: 12,
    },
    sellerGuardrails: {
      party: "SELLER",
      costBasisMicroUsdc: 700n,
      minMarginPct: 13,
      minQuantity: 1_000,
      availableQuantity: 11_000,
      maxSlaTier: "premium",
      minDeliveryWindowHours: 12,
      maxRounds: 12,
    },
    buyerOpeningMicroUsdc: 500n,
    sellerOpeningMicroUsdc: 1500n,
    terms: STANDARD_TERMS,
    expectation: "Converges late, after real concessions",
  },
  C: {
    name: "C",
    label: "No ZOPA",
    roundCap: 12,
    // Buyer band [0, 600]. Seller floor: ceil(800 * 10800/10000 * 110/100)
    // = ceil(950.4) = 951. The bands CANNOT intersect: 951 > 600. No price
    // satisfies both owners, so both sides must walk away with no payment.
    buyerGuardrails: {
      party: "BUYER",
      maxUnitPriceMicroUsdc: 600n,
      maxTotalSpendMicroUsdc: 6_000_000n,
      minQuantity: 1_000,
      targetQuantity: QUANTITY,
      minSlaTier: "basic",
      maxDeliveryWindowHours: 72,
      maxRounds: 12,
    },
    sellerGuardrails: {
      party: "SELLER",
      costBasisMicroUsdc: 800n,
      minMarginPct: 10,
      minQuantity: 1_000,
      availableQuantity: 20_000,
      maxSlaTier: "premium",
      minDeliveryWindowHours: 12,
      maxRounds: 12,
    },
    buyerOpeningMicroUsdc: 400n,
    sellerOpeningMicroUsdc: 1500n,
    terms: STANDARD_TERMS,
    expectation: "Both walk away, no payment",
  },
};

export function isScenarioName(value: string): value is ScenarioName {
  return value === "A" || value === "B" || value === "C";
}
