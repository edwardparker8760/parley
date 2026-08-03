/**
 * Seller utility over (price, quantity, terms), normalised to [0,1].
 *
 * Per spec section 9: the seller maximises margin per call and capacity
 * utilised against delivery-window tightness and SLA commitment cost.
 *
 * The margin component measures the price against the DERIVED floor for these
 * terms, not against a fixed number. So the same price scores worse when the
 * buyer has demanded tighter terms, which is the whole reason terms are worth
 * trading.
 */

import type { Offer } from "@parley/shared";
import { deriveSellerMinUnitPrice } from "@parley/guardrails";
import type { SellerGuardrails } from "@parley/guardrails";
import {
  assertWeightsSumToOne,
  norm,
  normMicro,
  slaToOrdinal,
} from "./normalise-utility-inputs.js";
import type { UtilityWeights } from "./normalise-utility-inputs.js";

/** a: margin, b: capacity utilised, c: delivery slack, d: SLA cost. */
export const DEFAULT_SELLER_WEIGHTS: UtilityWeights = {
  a: 0.45,
  b: 0.3,
  c: 0.15,
  d: 0.1,
};

/**
 * Ceiling used to normalise margin. The seller has no price ceiling of its
 * own, so one is synthesised as a multiple of the floor purely to give the
 * margin component a finite scale. It is a normalisation device, never a limit.
 */
export const SELLER_MARGIN_CEILING_MULTIPLE = 2n;

export function computeSellerUtility(
  guardrails: SellerGuardrails,
  offer: Offer,
  weights: UtilityWeights = DEFAULT_SELLER_WEIGHTS,
): number {
  assertWeightsSumToOne(weights, "seller");

  const floor = deriveSellerMinUnitPrice(guardrails, offer.terms);
  const marginCeiling = floor * SELLER_MARGIN_CEILING_MULTIPLE;

  // More margin above the terms-adjusted floor is better.
  const marginScore = normMicro(offer.unitPriceMicroUsdc, floor, marginCeiling);

  // Selling more of available capacity is better.
  const utilisationScore = norm(offer.quantity, 0, guardrails.availableQuantity);

  // A looser delivery window is cheaper to serve, so it scores higher.
  const deliveryScore = norm(
    offer.terms.deliveryWindowHours,
    guardrails.minDeliveryWindowHours,
    168,
  );

  // Committing to a higher SLA costs the seller, so it scores lower.
  const slaCostScore = 1 - norm(slaToOrdinal(offer.terms.slaTier), 0, 2);

  return (
    weights.a * marginScore +
    weights.b * utilisationScore +
    weights.c * deliveryScore +
    weights.d * slaCostScore
  );
}
