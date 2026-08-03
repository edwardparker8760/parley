/**
 * The seller side.
 *
 * A seller wants margin: it opens HIGH and concedes DOWN toward its minimum
 * sellable price, which its owner derives from cost basis plus minimum margin
 * (spec section 3). That minimum is private to this side.
 *
 * This module must never import `buyer-agent.ts` or any buyer guardrail
 * module. Shared behaviour lives in `baseline-negotiating-agent.ts`.
 */

import type { MicroUsdc, Terms } from "@parley/shared";
import { deriveSellerMinUnitPrice } from "@parley/guardrails";
import type { SellerGuardrails } from "@parley/guardrails";
import { BaselineNegotiatingAgent } from "./baseline-negotiating-agent.js";
import type { Agent } from "./agent-interface.js";

/** Strategy knobs. These are NOT limits; the limits live in SellerGuardrails. */
export interface SellerStrategyOptions {
  /** Where the seller starts. Above the floor, or there is nothing to concede. */
  readonly openingUnitPriceMicroUsdc: MicroUsdc;
  readonly terms: Terms;
  /** Fraction of the gap conceded per round, in basis points. 2000 = 20%. */
  readonly concessionBasisPoints?: number;
}

export function createSellerAgent(
  guardrails: SellerGuardrails,
  options: SellerStrategyOptions,
): Agent {
  // The floor is DERIVED from cost basis, margin, and the terms on the table.
  // It is never set by hand, so it cannot silently contradict the margin
  // requirement the owner actually stated.
  const floor = deriveSellerMinUnitPrice(guardrails, options.terms);

  if (options.openingUnitPriceMicroUsdc < floor) {
    throw new Error(
      `Seller opening price ${options.openingUnitPriceMicroUsdc} is below its ` +
        `own derived floor ${floor}. The opening offer would already breach ` +
        `the owner's margin requirement.`,
    );
  }

  return new BaselineNegotiatingAgent("SELLER", guardrails, {
    direction: "DOWN",
    openingUnitPriceMicroUsdc: options.openingUnitPriceMicroUsdc,
    limitUnitPriceMicroUsdc: floor,
    concessionBasisPoints: options.concessionBasisPoints ?? 2000,
    quantity: guardrails.availableQuantity,
    // The seller meets the buyer's request, capped at what it can supply.
    quantityRole: "SUPPLIES",
    terms: options.terms,
  });
}
