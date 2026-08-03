/**
 * THE SINGLE SOURCE OF TRUTH FOR "LEGAL".
 *
 * Given one side's guardrails, a quantity, and a set of terms, this returns
 * the closed interval of unit prices that satisfy every hard bound that side's
 * owner set. Both the clamp (which produces offers) and the independent bus
 * egress guard (which polices them) derive their answer from this function and
 * from nothing else they share. That is the defence-in-depth arrangement: one
 * shared pure primitive, two independent users of it.
 *
 * Purity is load-bearing. No I/O, no clock, no randomness, and critically no
 * access to any free text. A band is a function of numbers and owner limits
 * only, which is why no prompt can move it (property P6).
 *
 * Neither side ever sees the other's band. The intersection of the two bands
 * is the ZOPA, and it is computed only by the neutral observer for the
 * dashboard in phase 04, never by an agent.
 */

import { slaTierRank } from "@parley/shared";
import type { Terms } from "@parley/shared";
import type { BuyerGuardrails } from "./buyer-guardrails-type.js";
import type { SellerGuardrails } from "./seller-guardrails-type.js";
import { deriveSellerMinUnitPrice } from "./derive-seller-min-unit-price.js";
import type { BandResult } from "./clamp-event-types.js";

/**
 * Buyer's legal price range: [0, min(maxUnitPrice, floor(budget / quantity))].
 *
 * The budget term is why this takes quantity: a unit price inside the unit
 * ceiling can still breach the total-spend ceiling once multiplied out. Integer
 * floor division rounds toward the buyer's own safety.
 */
export function computeBuyerBand(
  guardrails: BuyerGuardrails,
  quantity: number,
  terms: Terms,
): BandResult {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    return {
      empty: true,
      cause: "QUANTITY_BOUND",
      detail: `quantity ${quantity} is not a positive integer`,
    };
  }
  if (quantity < guardrails.minQuantity) {
    return {
      empty: true,
      cause: "QUANTITY_BOUND",
      detail: `quantity ${quantity} is below the buyer's minimum ${guardrails.minQuantity}`,
    };
  }
  if (slaTierRank(terms.slaTier) < slaTierRank(guardrails.minSlaTier)) {
    return {
      empty: true,
      cause: "TERMS_BOUND",
      detail: `SLA ${terms.slaTier} is below the buyer's minimum ${guardrails.minSlaTier}`,
    };
  }
  if (terms.deliveryWindowHours > guardrails.maxDeliveryWindowHours) {
    return {
      empty: true,
      cause: "TERMS_BOUND",
      detail:
        `delivery window ${terms.deliveryWindowHours}h exceeds the buyer's ` +
        `maximum ${guardrails.maxDeliveryWindowHours}h`,
    };
  }

  const budgetDerivedCeiling =
    guardrails.maxTotalSpendMicroUsdc / BigInt(quantity);
  const hi =
    budgetDerivedCeiling < guardrails.maxUnitPriceMicroUsdc
      ? budgetDerivedCeiling
      : guardrails.maxUnitPriceMicroUsdc;

  if (hi <= 0n) {
    return {
      empty: true,
      cause: "BUDGET_BOUND",
      detail:
        `total spend cap ${guardrails.maxTotalSpendMicroUsdc} over ${quantity} ` +
        `calls leaves no positive unit price`,
    };
  }

  return { empty: false, loMicroUsdc: 0n, hiMicroUsdc: hi };
}

/**
 * Seller's legal price range: [derivedFloor(terms), unbounded).
 *
 * An owner sets a floor, not a ceiling: no seller objects to being paid more.
 * The floor is terms-sensitive, so tighter terms genuinely cost more.
 */
export function computeSellerBand(
  guardrails: SellerGuardrails,
  quantity: number,
  terms: Terms,
): BandResult {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    return {
      empty: true,
      cause: "QUANTITY_BOUND",
      detail: `quantity ${quantity} is not a positive integer`,
    };
  }
  if (quantity < guardrails.minQuantity) {
    return {
      empty: true,
      cause: "QUANTITY_BOUND",
      detail: `quantity ${quantity} is below the seller's minimum ${guardrails.minQuantity}`,
    };
  }
  if (quantity > guardrails.availableQuantity) {
    return {
      empty: true,
      cause: "QUANTITY_BOUND",
      detail:
        `quantity ${quantity} exceeds available capacity ` +
        `${guardrails.availableQuantity}`,
    };
  }
  if (slaTierRank(terms.slaTier) > slaTierRank(guardrails.maxSlaTier)) {
    return {
      empty: true,
      cause: "TERMS_BOUND",
      detail: `SLA ${terms.slaTier} exceeds the seller's maximum ${guardrails.maxSlaTier}`,
    };
  }
  if (terms.deliveryWindowHours < guardrails.minDeliveryWindowHours) {
    return {
      empty: true,
      cause: "TERMS_BOUND",
      detail:
        `delivery window ${terms.deliveryWindowHours}h is tighter than the ` +
        `seller's minimum ${guardrails.minDeliveryWindowHours}h`,
    };
  }

  return {
    empty: false,
    loMicroUsdc: deriveSellerMinUnitPrice(guardrails, terms),
    hiMicroUsdc: null,
  };
}

/** Dispatch on party. The only entry point callers should use. */
export function computeFeasibleBand(
  guardrails: BuyerGuardrails | SellerGuardrails,
  quantity: number,
  terms: Terms,
): BandResult {
  return guardrails.party === "BUYER"
    ? computeBuyerBand(guardrails, quantity, terms)
    : computeSellerBand(guardrails, quantity, terms);
}

/** Is this price inside this band? The one containment predicate. */
export function isWithinBand(
  band: BandResult,
  unitPriceMicroUsdc: bigint,
): boolean {
  if (band.empty) return false;
  if (unitPriceMicroUsdc < band.loMicroUsdc) return false;
  if (band.hiMicroUsdc !== null && unitPriceMicroUsdc > band.hiMicroUsdc) {
    return false;
  }
  return true;
}
