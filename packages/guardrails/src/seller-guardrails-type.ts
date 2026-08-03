/**
 * What the seller's human owner sets before the negotiation opens (spec §3).
 *
 * Note what is NOT here: `minUnitPriceMicroUsdc`. The seller's floor is
 * DERIVED from cost basis, minimum margin, and the terms on the table. Making
 * it derivable rather than settable is deliberate: a hand-set floor could
 * silently contradict the margin requirement, and then the margin promise
 * would be decoration rather than a limit.
 */

import type { MicroUsdc, SlaTier } from "@parley/shared";

export interface SellerGuardrails {
  readonly party: "SELLER";
  /** What a call actually costs the seller to serve, before margin. */
  readonly costBasisMicroUsdc: MicroUsdc;
  /** Minimum acceptable margin over cost basis, in percent. */
  readonly minMarginPct: number;
  /** Calls the seller can actually supply. */
  readonly availableQuantity: number;
  /** Smallest order worth fulfilling. */
  readonly minQuantity: number;
  /** Highest service level the seller is willing to commit to. */
  readonly maxSlaTier: SlaTier;
  /**
   * Tightest delivery window the seller will accept, in hours. A window
   * tighter than this cannot be served at any price.
   */
  readonly minDeliveryWindowHours: number;
  readonly maxRounds: number;
}

export function isSellerGuardrails(value: {
  party: string;
}): value is SellerGuardrails {
  return value.party === "SELLER";
}

export type PartyGuardrails =
  | import("./buyer-guardrails-type.js").BuyerGuardrails
  | SellerGuardrails;
