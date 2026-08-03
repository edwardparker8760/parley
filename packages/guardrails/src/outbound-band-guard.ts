/**
 * The second, INDEPENDENT check. This is what makes the safety claim true of
 * the wire rather than merely of the strategy.
 *
 * It sits on the message bus egress, and because the bus is the only path
 * between the two agents, a message that this rejects never reaches the
 * counterparty. It re-derives the band from the ENVELOPE'S OWN quantity and
 * terms and re-asserts containment.
 *
 * MUST NOT import `clamp-offer-into-band.ts`. The two checks share exactly one
 * thing, the pure `compute-feasible-band` primitive, and nothing else. If they
 * shared the clamp's code path, a single bug would defeat both and the
 * defence-in-depth arrangement would be theatre. The phase 03 sabotage check
 * exists to prove this independence: disable the clamp, and property P4 must
 * fail.
 *
 * Fail closed. A breach aborts the negotiation; it is never swallowed and the
 * message is never "fixed up" and sent anyway.
 */

import type { Envelope, EnvelopeParty } from "@parley/protocol";
import type { BuyerGuardrails } from "./buyer-guardrails-type.js";
import type { SellerGuardrails } from "./seller-guardrails-type.js";
import { computeFeasibleBand, isWithinBand } from "./compute-feasible-band.js";
import { ClampBreachError } from "./clamp-event-types.js";

export type GuardrailsByParty = Readonly<
  Record<EnvelopeParty, BuyerGuardrails | SellerGuardrails>
>;

/**
 * Assert an outbound envelope lies inside its own sender's feasible band.
 *
 * Only priced messages carry a band obligation. ACCEPT is checked separately,
 * at the point of acceptance, because the band it must satisfy belongs to the
 * accepting side while the price belongs to the offer being accepted.
 */
export function assertOutboundWithinBand(
  guardrails: BuyerGuardrails | SellerGuardrails,
  envelope: Envelope,
): void {
  if (envelope.type !== "OFFER" && envelope.type !== "COUNTEROFFER") {
    return;
  }

  const { offer } = envelope;
  const band = computeFeasibleBand(guardrails, offer.quantity, offer.terms);

  if (band.empty) {
    throw new ClampBreachError({
      party: envelope.from,
      bound: "BAND",
      detail:
        `no feasible band exists for quantity ${offer.quantity} and terms ` +
        `${offer.terms.slaTier}/${offer.terms.deliveryWindowHours}h ` +
        `(${band.cause}: ${band.detail}), yet an offer was emitted`,
    });
  }

  if (!isWithinBand(band, offer.unitPriceMicroUsdc)) {
    throw new ClampBreachError({
      party: envelope.from,
      bound: "BAND",
      detail:
        `unit price ${offer.unitPriceMicroUsdc} is outside the sender's own ` +
        `band [${band.loMicroUsdc}, ${band.hiMicroUsdc ?? "unbounded"}]`,
    });
  }

  // The buyer's total-spend cap is not expressible as a price interval alone,
  // so it is re-asserted here independently of the clamp's own re-check.
  if (guardrails.party === "BUYER") {
    const total = offer.unitPriceMicroUsdc * BigInt(offer.quantity);
    if (total > guardrails.maxTotalSpendMicroUsdc) {
      throw new ClampBreachError({
        party: envelope.from,
        bound: "MAX_TOTAL_SPEND",
        detail:
          `total ${total} exceeds the buyer's spend cap ` +
          `${guardrails.maxTotalSpendMicroUsdc}`,
      });
    }
  }
}

/**
 * May this side accept this offer?
 *
 * Accepting is the highest-risk path and the easiest to forget: it is the one
 * place where a side commits to a price it did not itself propose. An agent
 * may only accept an offer sitting inside its OWN current feasible band.
 */
export function canAcceptOffer(
  guardrails: BuyerGuardrails | SellerGuardrails,
  offer: {
    unitPriceMicroUsdc: bigint;
    quantity: number;
    terms: import("@parley/shared").Terms;
  },
): { allowed: boolean; reason: string } {
  const band = computeFeasibleBand(guardrails, offer.quantity, offer.terms);
  if (band.empty) {
    return {
      allowed: false,
      reason: `no feasible band (${band.cause}: ${band.detail})`,
    };
  }
  if (!isWithinBand(band, offer.unitPriceMicroUsdc)) {
    return {
      allowed: false,
      reason:
        `price ${offer.unitPriceMicroUsdc} is outside own band ` +
        `[${band.loMicroUsdc}, ${band.hiMicroUsdc ?? "unbounded"}]`,
    };
  }
  if (guardrails.party === "BUYER") {
    const total = offer.unitPriceMicroUsdc * BigInt(offer.quantity);
    if (total > guardrails.maxTotalSpendMicroUsdc) {
      return {
        allowed: false,
        reason: `total ${total} exceeds spend cap ${guardrails.maxTotalSpendMicroUsdc}`,
      };
    }
  }
  return { allowed: true, reason: "within own band" };
}
