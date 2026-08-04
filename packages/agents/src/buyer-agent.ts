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
import type { ConcessionMode } from "@parley/negotiation-engine";
import { BaselineNegotiatingAgent } from "./baseline-negotiating-agent.js";
import { EngineNegotiatingAgent } from "./engine-negotiating-agent.js";
import type { Agent, StrategyName } from "./agent-interface.js";
import type { AgentLlmSettings } from "./llm-offer-consultation.js";

/** Strategy knobs. These are NOT limits; the limits live in BuyerGuardrails. */
export interface BuyerStrategyOptions {
  /** Where the buyer starts. Below the ceiling, or there is nothing to talk about. */
  readonly openingUnitPriceMicroUsdc: MicroUsdc;
  readonly terms: Terms;
  /** "engine" (default) or "baseline", the phase 02 benchmark. */
  readonly strategy?: StrategyName;
  /** Fraction of the gap conceded per round, in basis points. 2000 = 20%. */
  readonly concessionBasisPoints?: number;
  /** Back-loading exponent for the engine. Higher concedes later. */
  readonly beta?: number;
  readonly minAcceptableUtility?: number;
  /** Exposed so the exploitability test can run the vulnerable form. */
  readonly concessionMode?: ConcessionMode;
  /** Bounded LLM settings. Absent means deterministic, as in phase 04. */
  readonly llm?: AgentLlmSettings;
  /** Fixes the jitter stream, so a demo run is reproducible. */
  readonly seedKey?: string;
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

  // STRATEGY=baseline reverts to the phase 02 behaviour with no code change.
  // This is the cheapest rollback in the plan and is deliberate: if the engine
  // misbehaves on demo day, one env var restores a working negotiation.
  if ((options.strategy ?? "engine") === "engine") {
    return new EngineNegotiatingAgent("BUYER", guardrails, {
      aspirationMicroUsdc: options.openingUnitPriceMicroUsdc,
      terms: options.terms,
      quantity: guardrails.targetQuantity,
      beta: options.beta ?? 2,
      minAcceptableUtility: options.minAcceptableUtility ?? 0,
      concessionMode: options.concessionMode ?? "DEFENDED",
      privateSalt: "buyer-private-salt",
      ...(options.llm !== undefined ? { llm: options.llm } : {}),
      ...(options.seedKey !== undefined ? { seedKey: options.seedKey } : {}),
    });
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
