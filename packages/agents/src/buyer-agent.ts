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
import type { BuyerGuardrails } from "@parley/guardrails";
import { BaselineNegotiatingAgent } from "./baseline-negotiating-agent.js";
import type { Agent } from "./agent-interface.js";

/** Strategy knobs. These are NOT limits; the limits live in BuyerGuardrails. */
export interface BuyerStrategyOptions {
  /** Where the buyer starts. Below the ceiling, or there is nothing to talk about. */
  readonly openingUnitPriceMicroUsdc: MicroUsdc;
  readonly terms: Terms;
  /** Fraction of the gap conceded per round, in basis points. 2000 = 20%. */
  readonly concessionBasisPoints?: number;
}

export function createBuyerAgent(
  guardrails: BuyerGuardrails,
  options: BuyerStrategyOptions,
): Agent {
  if (options.openingUnitPriceMicroUsdc > guardrails.maxUnitPriceMicroUsdc) {
    throw new Error(
      "Buyer opening price is above its own maximum. The opening offer would " +
        "already breach the owner's limit.",
    );
  }

  return new BaselineNegotiatingAgent("BUYER", guardrails, {
    direction: "UP",
    openingUnitPriceMicroUsdc: options.openingUnitPriceMicroUsdc,
    limitUnitPriceMicroUsdc: guardrails.maxUnitPriceMicroUsdc,
    concessionBasisPoints: options.concessionBasisPoints ?? 2000,
    quantity: guardrails.targetQuantity,
    // The buyer states the requirement; the seller fills it.
    quantityRole: "REQUESTS",
    terms: options.terms,
  });
}
