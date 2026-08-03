/**
 * Buyer utility over (price, quantity, terms), normalised to [0,1].
 *
 * Per spec section 9: the buyer maximises calls secured and SLA tier against
 * unit price and total spend. Price and spend enter negatively, which is why
 * both appear as `1 - norm(...)`.
 *
 * Consumes NUMBERS ONLY. Counterparty rationale text is never an input, which
 * preserves the phase 03 text-independence guarantee (P6) all the way up the
 * stack rather than only inside the clamp.
 */

import type { Offer } from "@parley/shared";
import type { BuyerGuardrails } from "@parley/guardrails";
import {
  assertWeightsSumToOne,
  norm,
  normMicro,
  slaToOrdinal,
} from "./normalise-utility-inputs.js";
import type { UtilityWeights } from "./normalise-utility-inputs.js";

/** a: price, b: quantity, c: SLA, d: total spend. */
export const DEFAULT_BUYER_WEIGHTS: UtilityWeights = {
  a: 0.4,
  b: 0.3,
  c: 0.15,
  d: 0.15,
};

export function computeBuyerUtility(
  guardrails: BuyerGuardrails,
  offer: Offer,
  weights: UtilityWeights = DEFAULT_BUYER_WEIGHTS,
): number {
  assertWeightsSumToOne(weights, "buyer");

  // Cheaper is better, measured against the owner's own ceiling.
  const priceScore =
    1 - normMicro(offer.unitPriceMicroUsdc, 0n, guardrails.maxUnitPriceMicroUsdc);

  // More calls is better, up to what the buyer actually wants.
  const quantityScore = norm(
    offer.quantity,
    guardrails.minQuantity,
    Math.max(guardrails.minQuantity, guardrails.targetQuantity),
  );

  // Higher SLA is better, measured from the owner's floor upward.
  const slaScore = norm(
    slaToOrdinal(offer.terms.slaTier),
    slaToOrdinal(guardrails.minSlaTier),
    2,
  );

  const total = offer.unitPriceMicroUsdc * BigInt(offer.quantity);
  const spendScore =
    1 - normMicro(total, 0n, guardrails.maxTotalSpendMicroUsdc);

  return (
    weights.a * priceScore +
    weights.b * quantityScore +
    weights.c * slaScore +
    weights.d * spendScore
  );
}
