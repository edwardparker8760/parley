/**
 * The real engine agent. Same contract as the baseline, better brain.
 *
 * Per turn: derive state from the transcript, check whether inference says the
 * deal is hopeless, decide whether to accept, otherwise propose. Every path
 * ends at the phase 03 clamp, which is the only thing that can authorise a
 * number. The strategy proposes; arithmetic disposes.
 *
 * Guardrails are held in a frozen private store. The counterparty's guardrails
 * are not represented anywhere in this file, and the ZOPA oracle is not
 * imported, so this agent structurally cannot cheat.
 */

import { formatMicroAsUsdc } from "@parley/shared";
import type { MicroUsdc, Offer, Terms } from "@parley/shared";
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
import {
  buildPostMortem,
  computeBuyerUtility,
  computeSellerUtility,
  createSeededRandom,
  deriveAgentSeed,
  deriveState,
  emptyBandCauseToReason,
  inferZopaHopeless,
  priceWithin,
  proposeNextOffer,
  shouldAcceptOffer,
  STALL_ROUNDS_BEFORE_WALK_AWAY,
} from "@parley/negotiation-engine";
import type { ConcessionMode } from "@parley/negotiation-engine";
import type { Agent, DecisionInput, DecisionOutput } from "./agent-interface.js";

export interface EngineAgentConfig {
  readonly aspirationMicroUsdc: MicroUsdc;
  readonly terms: Terms;
  readonly quantity: number;
  readonly beta: number;
  readonly minAcceptableUtility: number;
  readonly concessionMode: ConcessionMode;
  /** Private, never crosses the bus. Makes our jitter unpredictable to them. */
  readonly privateSalt: string;
}

export class EngineNegotiatingAgent implements Agent {
  readonly party: EnvelopeParty;
  readonly #guardrails: GuardrailStore<BuyerGuardrails | SellerGuardrails>;
  readonly #config: EngineAgentConfig;
  #random: (() => number) | null = null;

  constructor(
    party: EnvelopeParty,
    guardrails: BuyerGuardrails | SellerGuardrails,
    config: EngineAgentConfig,
  ) {
    this.party = party;
    this.#guardrails = new GuardrailStore(guardrails);
    this.#config = config;
  }

  /** Seeded per negotiation, so a rerun of the same demo is identical. */
  #randomFor(negotiationId: string): () => number {
    if (this.#random === null) {
      this.#random = createSeededRandom(
        deriveAgentSeed(negotiationId, this.party, this.#config.privateSalt),
      );
    }
    return this.#random;
  }

  #utility(offer: Offer): number {
    const guardrails = this.#guardrails.get();
    return guardrails.party === "BUYER"
      ? computeBuyerUtility(guardrails, offer)
      : computeSellerUtility(guardrails, offer);
  }

  /** Our own band edge: the price past which we will not go. */
  #reservation(terms: Terms, quantity: number): MicroUsdc {
    const guardrails = this.#guardrails.get();
    const band = computeFeasibleBand(guardrails, quantity, terms);
    if (band.empty) {
      return guardrails.party === "BUYER" ? 0n : 0n;
    }
    return guardrails.party === "BUYER"
      ? (band.hiMicroUsdc ?? 0n)
      : band.loMicroUsdc;
  }

  async decide(input: DecisionInput): Promise<DecisionOutput> {
    const guardrails = this.#guardrails.get();
    const random = this.#randomFor(input.negotiationId);
    const state = deriveState(
      input.history,
      this.party,
      input.round,
      input.roundCap,
    );

    const quantity =
      input.inbound !== undefined && isOfferEnvelope(input.inbound)
        ? guardrails.party === "SELLER"
          ? Math.min(input.inbound.offer.quantity, this.#config.quantity)
          : this.#config.quantity
        : this.#config.quantity;

    const common = {
      negotiationId: input.negotiationId,
      round: input.round,
      seq: input.seq,
      from: this.party,
      createdAt: input.now().toISOString(),
    };

    const reservation = this.#reservation(this.#config.terms, quantity);

    // 1. Is there any hope? Inference from what they revealed, nothing else.
    const inference = inferZopaHopeless({
      state,
      selfParty: this.party,
      ownBandEdgeMicroUsdc: reservation,
    });

    const stalled = state.stallCount >= STALL_ROUNDS_BEFORE_WALK_AWAY;

    if (inference.hopeless || stalled) {
      const lastTheirs =
        state.counterpartyOffers[state.counterpartyOffers.length - 1] ?? null;
      const lastOurs = state.ownOffers[state.ownOffers.length - 1] ?? null;
      const postMortem = buildPostMortem({
        reasonCode: stalled ? "COUNTERPARTY_STALLED" : "NO_ZOPA_PRICE",
        boundName: stalled ? "counterparty stopped moving" : "own price limit",
        ownBandLo: guardrails.party === "SELLER" ? reservation : 0n,
        ownBandHi: guardrails.party === "BUYER" ? reservation : null,
        counterpartyLastOffer: lastTheirs,
        ownLastOffer: lastOurs,
        roundsUsed: input.round,
        detail: stalled
          ? `Counterparty made no meaningful move for ${state.stallCount} rounds.`
          : inference.reason,
      });

      return {
        outbound: {
          ...common,
          type: "WALK_AWAY",
          reasonCode: postMortem.reasonCode,
          rationale: postMortem.explanation.slice(0, 240),
        },
        clampEvents: [],
        decisionState: { strategy: "engine", postMortem, inference },
      };
    }

    // 2. Should we take what is on the table?
    if (input.inbound !== undefined && isOfferEnvelope(input.inbound)) {
      const inboundUtility = this.#utility(input.inbound.offer);
      const wouldPropose = proposeNextOffer({
        state,
        guardrails,
        aspirationMicroUsdc: this.#config.aspirationMicroUsdc,
        reservationMicroUsdc: reservation,
        currentTerms: this.#config.terms,
        quantity,
        beta: this.#config.beta,
        random,
        mode: this.#config.concessionMode,
      });
      const reachableUtility = this.#utility({
        unitPriceMicroUsdc: wouldPropose.unitPriceMicroUsdc,
        quantity: wouldPropose.quantity,
        terms: wouldPropose.terms,
      });

      const band = computeFeasibleBand(
        guardrails,
        input.inbound.offer.quantity,
        input.inbound.offer.terms,
      );
      const withinOwnBand =
        !band.empty &&
        priceWithin(
          input.inbound.offer.unitPriceMicroUsdc,
          band.loMicroUsdc,
          band.hiMicroUsdc,
        );

      const decision = shouldAcceptOffer({
        inboundUtility,
        reachableUtility,
        minAcceptableUtility: this.#config.minAcceptableUtility,
        roundsRemaining: input.roundsRemaining,
        withinOwnBand,
      });

      if (decision.accept) {
        const permitted = canAcceptOffer(guardrails, input.inbound.offer);
        if (permitted.allowed) {
          return {
            outbound: {
              ...common,
              type: "ACCEPT",
              acceptsSeq: input.inbound.seq,
              rationale:
                decision.reason === "DEADLINE_AND_ACCEPTABLE"
                  ? `${formatMicroAsUsdc(input.inbound.offer.unitPriceMicroUsdc)}/call ` +
                    `scores ${inboundUtility.toFixed(2)}, below the ` +
                    `${reachableUtility.toFixed(2)} I wanted, but it clears my ` +
                    `limits and the rounds are gone. Better than no deal.`
                  : `${formatMicroAsUsdc(input.inbound.offer.unitPriceMicroUsdc)}/call ` +
                    `scores ${inboundUtility.toFixed(2)} for me, at or above the ` +
                    `${reachableUtility.toFixed(2)} I could still reach. Taking it.`,
            },
            clampEvents: [],
            decisionState: { strategy: "engine", decision, inboundUtility },
          };
        }
      }
    }

    // 3. Otherwise, propose. Then let the clamp dispose.
    const proposal = proposeNextOffer({
      state,
      guardrails,
      aspirationMicroUsdc: this.#config.aspirationMicroUsdc,
      reservationMicroUsdc: reservation,
      currentTerms: this.#config.terms,
      quantity,
      beta: this.#config.beta,
      random,
      mode: this.#config.concessionMode,
    });

    const clamped = clampOfferIntoBand(guardrails, proposal);

    if (!clamped.ok) {
      const postMortem = buildPostMortem({
        reasonCode: emptyBandCauseToReason(clamped.cause),
        boundName: clamped.cause,
        ownBandLo: null,
        ownBandHi: null,
        counterpartyLastOffer:
          state.counterpartyOffers[state.counterpartyOffers.length - 1] ?? null,
        ownLastOffer: state.ownOffers[state.ownOffers.length - 1] ?? null,
        roundsUsed: input.round,
        detail: clamped.detail,
      });
      return {
        outbound: {
          ...common,
          type: "WALK_AWAY",
          reasonCode: postMortem.reasonCode,
          rationale: postMortem.explanation.slice(0, 240),
        },
        clampEvents: [
          {
            party: this.party,
            bound: "BAND_EMPTY",
            field: "unitPrice",
            proposed: proposal.unitPriceMicroUsdc.toString(),
            clamped: "NO_FEASIBLE_OFFER",
            explanation: clamped.detail,
          } satisfies ClampEvent,
        ],
        decisionState: { strategy: "engine", postMortem },
      };
    }

    const isOpening = state.ownOffers.length === 0;
    const utility = this.#utility(clamped.offer);

    return {
      outbound: {
        ...common,
        type: isOpening ? "OFFER" : "COUNTEROFFER",
        offer: clamped.offer,
        rationale: buildEngineRationale({
          opening: isOpening,
          price: clamped.offer.unitPriceMicroUsdc,
          utility,
          termsTraded: proposal.termsTraded,
          roundsRemaining: input.roundsRemaining,
        }),
      },
      clampEvents: clamped.clampsApplied,
      decisionState: {
        strategy: "engine",
        alpha: proposal.alpha,
        utility,
        termsTraded: proposal.termsTraded,
        proposedPrice: proposal.unitPriceMicroUsdc.toString(),
        finalPrice: clamped.offer.unitPriceMicroUsdc.toString(),
        inference: inference.reason,
      },
    };
  }
}

function buildEngineRationale(context: {
  opening: boolean;
  price: MicroUsdc;
  utility: number;
  termsTraded: string | null;
  roundsRemaining: number;
}): string {
  const unit = formatMicroAsUsdc(context.price);
  if (context.opening) {
    return `Opening at ${unit}/call.`;
  }
  if (context.termsTraded !== null) {
    return (
      `Holding near ${unit}/call by giving ground on terms instead ` +
      `(${context.termsTraded}). ${context.roundsRemaining} rounds left.`
    ).slice(0, 240);
  }
  return (
    `Moving to ${unit}/call, worth ${context.utility.toFixed(2)} to me. ` +
    `${context.roundsRemaining} rounds left.`
  ).slice(0, 240);
}
