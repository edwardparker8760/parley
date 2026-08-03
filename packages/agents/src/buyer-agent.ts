/**
 * The buyer side.
 *
 * A buyer wants bulk inference capacity cheaply: it opens LOW and concedes UP
 * toward its maximum payable price. That maximum is its owner's guardrail, set
 * in advance, and is private to this side.
 *
 * This module must never import `seller-agent.ts` or any seller guardrail
 * module. The shared behaviour lives in `baseline-negotiating-agent.ts`, which
 * is neutral about which side it is running.
 */

import type { MicroUsdc, Terms } from "@parley/shared";
import { BaselineNegotiatingAgent } from "./baseline-negotiating-agent.js";
import type { Agent } from "./agent-interface.js";

export interface BuyerGuardrails {
  /** Hard ceiling on unit price. The owner's limit. */
  readonly maxUnitPriceMicroUsdc: MicroUsdc;
  /** Where the buyer starts. Below the ceiling, or there is nothing to talk about. */
  readonly openingUnitPriceMicroUsdc: MicroUsdc;
  readonly quantity: number;
  readonly terms: Terms;
  /** Fraction of the gap conceded per round, in basis points. 2000 = 20%. */
  readonly concessionBasisPoints?: number;
}

export function createBuyerAgent(guardrails: BuyerGuardrails): Agent {
  if (guardrails.openingUnitPriceMicroUsdc > guardrails.maxUnitPriceMicroUsdc) {
    throw new Error(
      "Buyer opening price is above its own maximum. The opening offer would " +
        "already breach the owner's limit.",
    );
  }

  return new BaselineNegotiatingAgent("BUYER", {
    direction: "UP",
    openingUnitPriceMicroUsdc: guardrails.openingUnitPriceMicroUsdc,
    limitUnitPriceMicroUsdc: guardrails.maxUnitPriceMicroUsdc,
    concessionBasisPoints: guardrails.concessionBasisPoints ?? 2000,
    quantity: guardrails.quantity,
    // The buyer states the requirement; the seller fills it.
    quantityRole: "REQUESTS",
    terms: guardrails.terms,
  });
}
