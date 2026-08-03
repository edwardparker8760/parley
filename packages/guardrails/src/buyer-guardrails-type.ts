/**
 * What the buyer's human owner sets before the negotiation opens (spec §3).
 *
 * These are HARD LIMITS enforced in arithmetic, not instructions in a prompt.
 * They are set once, frozen, and private to the buyer's side. No envelope
 * field carries them and there is no API that reveals them to the seller.
 */

import type { MicroUsdc, SlaTier } from "@parley/shared";

export interface BuyerGuardrails {
  readonly party: "BUYER";
  /** Absolute ceiling on unit price. Never exceeded, for any reason. */
  readonly maxUnitPriceMicroUsdc: MicroUsdc;
  /**
   * Ceiling on unitPrice * quantity. The budget guard carried over from the
   * superseded pay-per-answer plan. Binds independently of the unit ceiling:
   * a price inside the unit limit can still blow the total.
   */
  readonly maxTotalSpendMicroUsdc: MicroUsdc;
  /** Fewer calls than this is not worth transacting for. */
  readonly minQuantity: number;
  /** What the buyer actually wants. */
  readonly targetQuantity: number;
  /** Lowest service level the buyer will accept. */
  readonly minSlaTier: SlaTier;
  /** Longest delivery window the buyer will tolerate, in hours. */
  readonly maxDeliveryWindowHours: number;
  readonly maxRounds: number;
}

export function isBuyerGuardrails(value: {
  party: string;
}): value is BuyerGuardrails {
  return value.party === "BUYER";
}
