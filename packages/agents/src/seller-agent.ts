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
import type { ConcessionMode } from "@parley/negotiation-engine";
import { BaselineNegotiatingAgent } from "./baseline-negotiating-agent.js";
import { EngineNegotiatingAgent } from "./engine-negotiating-agent.js";
import type { Agent, StrategyName } from "./agent-interface.js";
import type { AgentLlmSettings } from "./llm-offer-consultation.js";

/** Strategy knobs. These are NOT limits; the limits live in SellerGuardrails. */
export interface SellerStrategyOptions {
  /** Where the seller starts. Above the floor, or there is nothing to concede. */
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

  if ((options.strategy ?? "engine") === "engine") {
    return new EngineNegotiatingAgent("SELLER", guardrails, {
      aspirationMicroUsdc: options.openingUnitPriceMicroUsdc,
      terms: options.terms,
      quantity: guardrails.availableQuantity,
      beta: options.beta ?? 2,
      minAcceptableUtility: options.minAcceptableUtility ?? 0,
      concessionMode: options.concessionMode ?? "DEFENDED",
      privateSalt: "seller-private-salt",
      ...(options.llm !== undefined ? { llm: options.llm } : {}),
      ...(options.seedKey !== undefined ? { seedKey: options.seedKey } : {}),
    });
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
