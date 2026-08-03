/**
 * The agent both sides are built from.
 *
 * Buyer and seller are the SAME logic with opposite concession directions and
 * different private limits. Keeping that in one place is what stops the two
 * agents drifting apart in ways that would quietly bias a scenario, and it is
 * why neither `buyer-agent.ts` nor `seller-agent.ts` imports the other.
 *
 * The private config never leaves this object. It is not in the envelope, not
 * on the bus, and not in the decision state that gets persisted (the state
 * records the limit only as the agent's own audit trail, on its own side).
 */

import { formatMicroAsUsdc, offerTotalMicroUsdc } from "@parley/shared";
import type { MicroUsdc, Offer } from "@parley/shared";
import { isOfferEnvelope } from "@parley/protocol";
import type { Envelope, EnvelopeParty } from "@parley/protocol";
import type { Agent, DecisionInput, DecisionOutput } from "./agent-interface.js";
import {
  evaluateAcceptance,
  nextProposedPrice,
  resolveQuantity,
} from "./fixed-concession-baseline-strategy.js";
import type {
  BaselineDecisionState,
  BaselineStrategyConfig,
} from "./fixed-concession-baseline-strategy.js";

export class BaselineNegotiatingAgent implements Agent {
  readonly party: EnvelopeParty;
  /** Private. Never serialised onto the wire, never shared with the loop. */
  readonly #config: BaselineStrategyConfig;

  constructor(party: EnvelopeParty, config: BaselineStrategyConfig) {
    this.party = party;
    this.#config = config;
  }

  async decide(input: DecisionInput): Promise<DecisionOutput> {
    const ownPrevious = lastPriceFrom(input.history, this.party);
    const counterparty =
      input.inbound !== undefined && isOfferEnvelope(input.inbound)
        ? input.inbound.offer.unitPriceMicroUsdc
        : null;

    const { price, limitWasBinding } = nextProposedPrice(
      this.#config,
      ownPrevious,
      counterparty,
    );

    const acceptance =
      counterparty !== null && input.inbound !== undefined
        ? evaluateAcceptance({
            direction: this.#config.direction,
            counterpartyPrice: counterparty,
            ourNextPrice: price,
            ourLimit: this.#config.limitUnitPriceMicroUsdc,
            roundsRemaining: input.roundsRemaining,
          })
        : { accept: false, reason: "STILL_WORTH_COUNTERING" as const };
    const accepting = acceptance.accept;

    const decisionState: BaselineDecisionState = {
      strategy: "fixed-concession-baseline",
      direction: this.#config.direction,
      ownPreviousPrice: ownPrevious === null ? null : ownPrevious.toString(),
      counterpartyPrice: counterparty === null ? null : counterparty.toString(),
      concessionBasisPoints: this.#config.concessionBasisPoints,
      proposedPrice: price.toString(),
      limitPrice: this.#config.limitUnitPriceMicroUsdc.toString(),
      limitWasBinding,
      accepted: accepting,
      acceptanceReason: acceptance.reason,
    };

    const common = {
      negotiationId: input.negotiationId,
      round: input.round,
      seq: input.seq,
      from: this.party,
      createdAt: input.now().toISOString(),
    };

    if (accepting && input.inbound !== undefined) {
      const outbound: Envelope = {
        ...common,
        type: "ACCEPT",
        acceptsSeq: input.inbound.seq,
        rationale:
          `Their ${formatMicroAsUsdc(counterparty as MicroUsdc)}/call is at least as good ` +
          `as the ${formatMicroAsUsdc(price)} I was about to propose. Taking it.`,
      };
      return { outbound, decisionState };
    }

    const counterpartyQuantity =
      input.inbound !== undefined && isOfferEnvelope(input.inbound)
        ? input.inbound.offer.quantity
        : null;

    const offer: Offer = {
      unitPriceMicroUsdc: price,
      quantity: resolveQuantity(this.#config, counterpartyQuantity),
      terms: this.#config.terms,
    };

    const outbound: Envelope = {
      ...common,
      type: ownPrevious === null ? "OFFER" : "COUNTEROFFER",
      offer,
      rationale: buildRationale({
        opening: ownPrevious === null,
        price,
        total: offerTotalMicroUsdc(offer),
        limitWasBinding,
        roundsRemaining: input.roundsRemaining,
      }),
    };
    return { outbound, decisionState };
  }
}

/** Most recent price this party proposed, or null if it has not spoken yet. */
function lastPriceFrom(
  history: readonly Envelope[],
  party: EnvelopeParty,
): MicroUsdc | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const envelope = history[index];
    if (envelope === undefined) continue;
    if (envelope.from === party && isOfferEnvelope(envelope)) {
      return envelope.offer.unitPriceMicroUsdc;
    }
  }
  return null;
}

function buildRationale(context: {
  opening: boolean;
  price: MicroUsdc;
  total: MicroUsdc;
  limitWasBinding: boolean;
  roundsRemaining: number;
}): string {
  const unit = formatMicroAsUsdc(context.price);
  const total = formatMicroAsUsdc(context.total);
  if (context.opening) {
    return `Opening at ${unit}/call (${total} USDC total).`;
  }
  if (context.limitWasBinding) {
    return (
      `Moved to ${unit}/call and that is my limit; I cannot go further. ` +
      `${context.roundsRemaining} rounds left.`
    );
  }
  return (
    `Conceding to ${unit}/call (${total} USDC total), ` +
    `${context.roundsRemaining} rounds left.`
  );
}
