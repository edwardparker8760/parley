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
import { BaselineNegotiatingAgent } from "./baseline-negotiating-agent.js";
import type { Agent } from "./agent-interface.js";

export interface SellerGuardrails {
  /** Hard floor on unit price, derived from cost basis and minimum margin. */
  readonly minUnitPriceMicroUsdc: MicroUsdc;
  /** Where the seller starts. Above the floor, or there is nothing to concede. */
  readonly openingUnitPriceMicroUsdc: MicroUsdc;
  /** Calls the seller can actually supply. */
  readonly availableQuantity: number;
  readonly terms: Terms;
  /** Fraction of the gap conceded per round, in basis points. 2000 = 20%. */
  readonly concessionBasisPoints?: number;
}

export function createSellerAgent(guardrails: SellerGuardrails): Agent {
  if (guardrails.openingUnitPriceMicroUsdc < guardrails.minUnitPriceMicroUsdc) {
    throw new Error(
      "Seller opening price is below its own minimum. The opening offer would " +
        "already breach the owner's limit.",
    );
  }

  return new BaselineNegotiatingAgent("SELLER", {
    direction: "DOWN",
    openingUnitPriceMicroUsdc: guardrails.openingUnitPriceMicroUsdc,
    limitUnitPriceMicroUsdc: guardrails.minUnitPriceMicroUsdc,
    concessionBasisPoints: guardrails.concessionBasisPoints ?? 2000,
    quantity: guardrails.availableQuantity,
    // The seller meets the buyer's request, capped at what it can supply.
    quantityRole: "SUPPLIES",
    terms: guardrails.terms,
  });
}
