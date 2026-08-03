/**
 * Produce this round's proposal: price, quantity, terms.
 *
 * The output is a PROPOSAL, not a message. It goes to the phase 03 clamp next,
 * which is the only thing that can authorise it. Phase 05 will insert the LLM
 * between this module and the clamp, never after it.
 *
 * Includes the terms-for-price trade: when our price target would breach our
 * own reservation, try buying the gap back with a term concession before
 * giving up on the price. That behaviour is what separates this from a
 * price-only haggle, and it is the most interesting thing on screen.
 */

import type { MicroUsdc, SlaTier, Terms } from "@parley/shared";
import { deriveSellerMinUnitPrice } from "@parley/guardrails";
import type { BuyerGuardrails, SellerGuardrails } from "@parley/guardrails";
import { computeConcessionTarget } from "./time-dependent-concession-schedule.js";
import type { ConcessionMode } from "./time-dependent-concession-schedule.js";
import { counterpartyConcessionRatio } from "./negotiation-state-types.js";
import type { NegotiationState } from "./negotiation-state-types.js";

export interface ProposalInputs {
  readonly state: NegotiationState;
  readonly guardrails: BuyerGuardrails | SellerGuardrails;
  readonly aspirationMicroUsdc: MicroUsdc;
  readonly reservationMicroUsdc: MicroUsdc;
  readonly currentTerms: Terms;
  readonly quantity: number;
  readonly beta: number;
  readonly random: () => number;
  readonly mode: ConcessionMode;
}

export interface Proposal {
  readonly unitPriceMicroUsdc: MicroUsdc;
  readonly quantity: number;
  readonly terms: Terms;
  readonly alpha: number;
  /** Set when a term was traded to protect the price. Demo material. */
  readonly termsTraded: string | null;
}

const SLA_DESCENDING: SlaTier[] = ["premium", "standard", "basic"];

/**
 * Seller-side terms concession: loosen what we commit to, so our derived floor
 * drops and a price we could not otherwise justify becomes sellable.
 *
 * Capped at ONE term change per round, so the ladder stays readable. A demo
 * where three things move at once is a demo nobody can follow.
 */
function trySellerTermsConcession(
  guardrails: SellerGuardrails,
  terms: Terms,
  targetPrice: MicroUsdc,
): { terms: Terms; traded: string } | null {
  // Loosening delivery is the cheapest concession to explain out loud.
  const looser: Terms = {
    ...terms,
    deliveryWindowHours: terms.deliveryWindowHours + 24,
  };
  if (deriveSellerMinUnitPrice(guardrails, looser) <= targetPrice) {
    return {
      terms: looser,
      traded: `delivery window ${terms.deliveryWindowHours}h to ${looser.deliveryWindowHours}h`,
    };
  }

  // Otherwise drop one SLA tier, which cuts the commitment cost.
  const currentIndex = SLA_DESCENDING.indexOf(terms.slaTier);
  const lowerTier = SLA_DESCENDING[currentIndex + 1];
  if (lowerTier !== undefined) {
    const cheaper: Terms = { ...terms, slaTier: lowerTier };
    if (deriveSellerMinUnitPrice(guardrails, cheaper) <= targetPrice) {
      return {
        terms: cheaper,
        traded: `SLA ${terms.slaTier} to ${lowerTier}`,
      };
    }
  }

  return null;
}

export function proposeNextOffer(inputs: ProposalInputs): Proposal {
  const { targetMicroUsdc, alpha } = computeConcessionTarget({
    round: inputs.state.round,
    roundCap: inputs.state.roundCap,
    aspirationMicroUsdc: inputs.aspirationMicroUsdc,
    reservationMicroUsdc: inputs.reservationMicroUsdc,
    beta: inputs.beta,
    counterpartyConcessionRatio: counterpartyConcessionRatio(inputs.state),
    random: inputs.random,
    mode: inputs.mode,
  });

  let terms = inputs.currentTerms;
  let termsTraded: string | null = null;

  // Terms-for-price trade, seller side only. A buyer's ceiling does not move
  // with terms, so it has nothing to buy back.
  //
  // The trigger is the counterparty's standing offer, not our own target. Our
  // own target can never fall below our floor (the schedule's aspiration floor
  // prevents it), so triggering on that would make this heuristic unreachable
  // dead code. Triggering on THEIR offer is also what a real seller does:
  // "I cannot do 0.00085 in 24 hours, but I can do it in 48."
  if (inputs.guardrails.party === "SELLER") {
    const floorHere = deriveSellerMinUnitPrice(inputs.guardrails, terms);
    const theirBest =
      inputs.state.counterpartyOffers[
        inputs.state.counterpartyOffers.length - 1
      ];

    const wantToReach =
      theirBest !== undefined && theirBest < floorHere ? theirBest : null;

    if (wantToReach !== null) {
      const traded = trySellerTermsConcession(
        inputs.guardrails,
        terms,
        wantToReach,
      );
      if (traded !== null) {
        terms = traded.terms;
        termsTraded = traded.traded;
      }
    }
  }

  return {
    unitPriceMicroUsdc: targetMicroUsdc,
    quantity: inputs.quantity,
    terms,
    alpha,
    termsTraded,
  };
}
