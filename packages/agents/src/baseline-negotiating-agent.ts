/**
 * The agent both sides are built from.
 *
 * Buyer and seller are the SAME logic with opposite concession directions and
 * different private guardrails. Keeping that in one place stops the two sides
 * drifting apart in ways that would quietly bias a scenario, and it is why
 * neither `buyer-agent.ts` nor `seller-agent.ts` imports the other.
 *
 * THE STRATEGY ONLY EVER PROPOSES. Every number it produces is passed through
 * `clampOfferIntoBand` before it can become a message, and the clamp is a pure
 * function of owner limits and arithmetic. So even a strategy that tried to
 * breach its owner's limits could not: the proposal would be clamped, and if
 * it somehow escaped, the independent egress guard on the bus would reject it.
 * From phase 05 the LLM sits exactly where the strategy sits, under the same
 * clamp, which is what makes "the LLM proposes, arithmetic disposes" literal.
 *
 * Guardrails live in a frozen private store and never leave this object.
 */

import { formatMicroAsUsdc, offerTotalMicroUsdc } from "@parley/shared";
import type { MicroUsdc, Offer } from "@parley/shared";
import { isOfferEnvelope } from "@parley/protocol";
import type { Envelope, EnvelopeParty } from "@parley/protocol";
import {
  canAcceptOffer,
  clampOfferIntoBand,
  computeFeasibleBand,
  GuardrailStore,
} from "@parley/guardrails";
import type {
  BuyerGuardrails,
  ClampEvent,
  SellerGuardrails,
} from "@parley/guardrails";
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
  /** Frozen, private. Never serialised, never crosses the bus. */
  readonly #guardrails: GuardrailStore<BuyerGuardrails | SellerGuardrails>;
  readonly #config: BaselineStrategyConfig;

  constructor(
    party: EnvelopeParty,
    guardrails: BuyerGuardrails | SellerGuardrails,
    config: BaselineStrategyConfig,
  ) {
    this.party = party;
    this.#guardrails = new GuardrailStore(guardrails);
    this.#config = config;
  }

  async decide(input: DecisionInput): Promise<DecisionOutput> {
    const guardrails = this.#guardrails.get();
    const ownPrevious = lastPriceFrom(input.history, this.party);
    const counterparty =
      input.inbound !== undefined && isOfferEnvelope(input.inbound)
        ? input.inbound.offer.unitPriceMicroUsdc
        : null;
    const counterpartyQuantity =
      input.inbound !== undefined && isOfferEnvelope(input.inbound)
        ? input.inbound.offer.quantity
        : null;

    const { price, limitWasBinding } = nextProposedPrice(
      this.#config,
      ownPrevious,
      counterparty,
    );

    const common = {
      negotiationId: input.negotiationId,
      round: input.round,
      seq: input.seq,
      from: this.party,
      createdAt: input.now().toISOString(),
    };

    // ACCEPT is the highest-risk path: it is the one place a side commits to a
    // price it did not itself propose. It gets its own band check.
    if (input.inbound !== undefined && isOfferEnvelope(input.inbound)) {
      const acceptance = evaluateAcceptance({
        direction: this.#config.direction,
        counterpartyPrice: input.inbound.offer.unitPriceMicroUsdc,
        ourNextPrice: price,
        ourLimit: this.#config.limitUnitPriceMicroUsdc,
        roundsRemaining: input.roundsRemaining,
      });

      if (acceptance.accept) {
        const permitted = canAcceptOffer(guardrails, input.inbound.offer);
        if (permitted.allowed) {
          return {
            outbound: {
              ...common,
              type: "ACCEPT",
              acceptsSeq: input.inbound.seq,
              rationale:
                `Their ${formatMicroAsUsdc(input.inbound.offer.unitPriceMicroUsdc)}/call ` +
                `is acceptable and inside my limits. Taking it.`,
            },
            clampEvents: [],
            decisionState: buildState(
              this.#config,
              ownPrevious,
              counterparty,
              price,
              limitWasBinding,
              true,
              acceptance.reason,
            ),
          };
        }
        // The strategy wanted to accept something outside the owner's band.
        // Arithmetic refuses, and the refusal is recorded as a clamp event so
        // the audience sees the guardrail bite on the riskiest path.
        const refusal: ClampEvent = {
          party: this.party,
          bound: "BAND_ON_ACCEPT",
          field: "unitPrice",
          proposed: input.inbound.offer.unitPriceMicroUsdc.toString(),
          clamped: "REFUSED",
          explanation: `Cannot accept: ${permitted.reason}.`,
        };
        const countered = this.#buildCounterOffer(
          input,
          common,
          price,
          counterpartyQuantity,
          limitWasBinding,
          ownPrevious,
          counterparty,
        );
        return {
          ...countered,
          clampEvents: [refusal, ...countered.clampEvents],
        };
      }
    }

    return this.#buildCounterOffer(
      input,
      common,
      price,
      counterpartyQuantity,
      limitWasBinding,
      ownPrevious,
      counterparty,
    );
  }

  /** Build an OFFER or COUNTEROFFER, clamped into the owner's band. */
  #buildCounterOffer(
    input: DecisionInput,
    common: {
      negotiationId: string;
      round: number;
      seq: number;
      from: EnvelopeParty;
      createdAt: string;
    },
    proposedPrice: MicroUsdc,
    counterpartyQuantity: number | null,
    limitWasBinding: boolean,
    ownPrevious: MicroUsdc | null,
    counterparty: MicroUsdc | null,
  ): DecisionOutput {
    const guardrails = this.#guardrails.get();
    const isOpening = ownPrevious === null;

    const proposal = {
      unitPriceMicroUsdc: proposedPrice,
      quantity: resolveQuantity(this.#config, counterpartyQuantity),
      terms: this.#config.terms,
    };

    const clamped = clampOfferIntoBand(guardrails, proposal);

    if (!clamped.ok) {
      // No legal offer exists at this quantity and these terms. Walking away
      // is the honest outcome: substituting a "closest legal" price would leak
      // this side's reservation value to the counterparty.
      return {
        outbound: {
          ...common,
          type: "WALK_AWAY",
          reasonCode: emptyBandToWalkAwayReason(clamped.cause),
          rationale:
            `No offer I can legally make works here: ${clamped.detail}. ` +
            `Walking away.`.slice(0, 240),
        },
        clampEvents: [
          {
            party: this.party,
            bound: "BAND_EMPTY",
            field: "unitPrice",
            proposed: proposedPrice.toString(),
            clamped: "NO_FEASIBLE_OFFER",
            explanation: clamped.detail,
          },
        ],
        decisionState: buildState(
          this.#config,
          ownPrevious,
          counterparty,
          proposedPrice,
          limitWasBinding,
          false,
          "STILL_WORTH_COUNTERING",
        ),
      };
    }

    const offer: Offer = clamped.offer;
    const band = computeFeasibleBand(guardrails, offer.quantity, offer.terms);

    return {
      outbound: {
        ...common,
        type: isOpening ? "OFFER" : "COUNTEROFFER",
        offer,
        rationale: buildRationale({
          opening: isOpening,
          price: offer.unitPriceMicroUsdc,
          total: offerTotalMicroUsdc(offer),
          limitWasBinding: limitWasBinding || clamped.clampsApplied.length > 0,
          roundsRemaining: input.roundsRemaining,
        }),
      },
      clampEvents: clamped.clampsApplied,
      decisionState: {
        ...buildState(
          this.#config,
          ownPrevious,
          counterparty,
          offer.unitPriceMicroUsdc,
          limitWasBinding,
          false,
          "STILL_WORTH_COUNTERING",
        ),
        bandLo: band.empty ? null : band.loMicroUsdc.toString(),
        bandHi: band.empty ? null : (band.hiMicroUsdc?.toString() ?? "unbounded"),
      },
    };
  }
}

/** Empty-band causes map onto the protocol's walk-away reason codes. */
function emptyBandToWalkAwayReason(
  cause: "PRICE_BOUND" | "BUDGET_BOUND" | "QUANTITY_BOUND" | "TERMS_BOUND",
): "NO_ZOPA_PRICE" | "NO_ZOPA_BUDGET" | "NO_ZOPA_QUANTITY" {
  switch (cause) {
    case "BUDGET_BOUND":
      return "NO_ZOPA_BUDGET";
    case "QUANTITY_BOUND":
      return "NO_ZOPA_QUANTITY";
    default:
      return "NO_ZOPA_PRICE";
  }
}

function buildState(
  config: BaselineStrategyConfig,
  ownPrevious: MicroUsdc | null,
  counterparty: MicroUsdc | null,
  proposedPrice: MicroUsdc,
  limitWasBinding: boolean,
  accepted: boolean,
  acceptanceReason: BaselineDecisionState["acceptanceReason"],
): BaselineDecisionState {
  return {
    strategy: "fixed-concession-baseline",
    direction: config.direction,
    ownPreviousPrice: ownPrevious === null ? null : ownPrevious.toString(),
    counterpartyPrice: counterparty === null ? null : counterparty.toString(),
    concessionBasisPoints: config.concessionBasisPoints,
    proposedPrice: proposedPrice.toString(),
    limitPrice: config.limitUnitPriceMicroUsdc.toString(),
    limitWasBinding,
    accepted,
    acceptanceReason,
  };
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
