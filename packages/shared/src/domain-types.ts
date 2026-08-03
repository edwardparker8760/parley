/**
 * Core domain types for a Parley negotiation.
 *
 * The traded good is bulk inference capacity (spec section 9): the buyer needs
 * N model calls, the seller sells capacity at a unit price. The negotiable
 * non-price terms are the delivery window and the SLA tier.
 *
 * Phase 02 extends these types with the message envelope. It does not redefine
 * them.
 */

import type { MicroUsdc } from "./money-micro-usdc.js";

/** Service level committed by the seller. Ordered worst to best. */
export type SlaTier = "basic" | "standard" | "premium";

/** SLA tiers in ascending order of value to the buyer and cost to the seller. */
export const SLA_TIERS_ASCENDING: readonly SlaTier[] = [
  "basic",
  "standard",
  "premium",
] as const;

/** Rank an SLA tier as 0, 1, 2 so utility functions can score it numerically. */
export function slaTierRank(tier: SlaTier): number {
  const rank = SLA_TIERS_ASCENDING.indexOf(tier);
  if (rank < 0) throw new Error(`Unknown SLA tier: ${tier}`);
  return rank;
}

/**
 * Non-price terms of a deal.
 *
 * A tighter delivery window is better for the buyer and costlier for the
 * seller, which is what makes terms tradeable against price.
 */
export interface Terms {
  /** Hours within which the capacity must be delivered. Lower is tighter. */
  readonly deliveryWindowHours: number;
  readonly slaTier: SlaTier;
}

/** A concrete proposal: a price, a quantity, and the terms attached to them. */
export interface Offer {
  readonly unitPriceMicroUsdc: MicroUsdc;
  /** Number of inference calls. A plain integer count, not money. */
  readonly quantity: number;
  readonly terms: Terms;
}

/** Which side of the negotiation a party sits on. */
export type Party = "buyer" | "seller";

/** Opaque identifier for one negotiation and the deal it may produce. */
export type DealId = string;

/** Total consideration implied by an offer. */
export function offerTotalMicroUsdc(offer: Offer): MicroUsdc {
  if (!Number.isSafeInteger(offer.quantity) || offer.quantity < 0) {
    throw new Error(`Offer quantity must be a non-negative safe integer`);
  }
  return offer.unitPriceMicroUsdc * BigInt(offer.quantity);
}

/** The counterparty of a given party. */
export function opposingParty(party: Party): Party {
  return party === "buyer" ? "seller" : "buyer";
}
