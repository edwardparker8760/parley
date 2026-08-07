/**
 * Builds the dashboard's one view shape from the ledger.
 *
 * This is the COLD READ path: given a negotiation id, reconstruct everything a
 * panel needs from persisted rows alone, with no live process. It is what
 * `/?negotiation=<id>` renders, and it is the fallback for shooting the video
 * if live streaming misbehaves on the day.
 *
 * The live path emits the same rows incrementally, so the panels never learn
 * which one they are looking at.
 *
 * ## Where the oracle enters, and why it is safe here
 *
 * `computeTrueZopa` sees both sides' guardrails. That is exactly what no agent
 * may do, and it is why this file lives in the orchestrator: the orchestrator
 * is the sanctioned observer, and phase 04's oracle-isolation test asserts that
 * no agent-side file imports it. The values it produces travel to the browser
 * under `observer`, never inside a message.
 */

import { deriveSellerMinUnitPrice } from "@parley/guardrails";
// Deliberately the `/oracle` subpath, not the package root. The oracle is not
// part of the engine's ordinary surface precisely so that an agent importing it
// is visible as an anomaly, and phase 04's isolation test scans for exactly
// this import in agent-side files.
import { computeTrueZopa } from "@parley/negotiation-engine/oracle";
import { isOfferEnvelope } from "@parley/protocol";
import type { Envelope } from "@parley/protocol";
import {
  ClampEventRepository,
  DealRepository,
  LlmInvocationRepository,
  MessageRepository,
  NegotiationRepository,
  PostMortemRepository,
  SettlementReceiptRepository,
} from "@parley/ledger";
import type { Database } from "@parley/ledger";
import { SCENARIOS, isScenarioName } from "./scenario-definitions.js";
import type { ScenarioDefinition, ScenarioName } from "./scenario-definitions.js";
import type {
  GuardrailsView,
  NegotiationView,
  ObserverView,
  PostMortemView,
  SettlementView,
  TranscriptRowView,
} from "./negotiation-view-types.js";

/** The terms and quantity the bands should be evaluated at. */
function finalTermsAndQuantity(
  transcript: readonly Envelope[],
  definition: ScenarioDefinition,
): { quantity: number; terms: ScenarioDefinition["terms"] } {
  const lastOffer = [...transcript].reverse().find((envelope) => isOfferEnvelope(envelope));
  if (lastOffer !== undefined && isOfferEnvelope(lastOffer)) {
    return { quantity: lastOffer.offer.quantity, terms: lastOffer.offer.terms };
  }
  return {
    quantity: definition.buyerGuardrails.targetQuantity,
    terms: definition.terms,
  };
}

export function buildObserverView(
  definition: ScenarioDefinition,
  quantity: number,
  terms: ScenarioDefinition["terms"],
): ObserverView {
  const zopa = computeTrueZopa(
    definition.buyerGuardrails,
    definition.sellerGuardrails,
    quantity,
    terms,
  );

  return {
    zopaExists: zopa.exists,
    zopaLoMicroUsdc: zopa.loMicroUsdc?.toString() ?? null,
    zopaHiMicroUsdc: zopa.hiMicroUsdc?.toString() ?? null,
    blockingCause: zopa.blockingCause,
    // The dashed lines: the buyer's ceiling and the seller's derived floor.
    buyerReservationMicroUsdc: zopa.buyerBand?.hi?.toString() ?? null,
    sellerReservationMicroUsdc: zopa.sellerBand?.lo?.toString() ?? null,
  };
}

export function buildGuardrailsView(
  definition: ScenarioDefinition,
  terms: ScenarioDefinition["terms"],
  clampCounts: { buyer: number; seller: number },
): GuardrailsView {
  const buyer = definition.buyerGuardrails;
  const seller = definition.sellerGuardrails;

  return {
    buyer: {
      maxUnitPriceMicroUsdc: buyer.maxUnitPriceMicroUsdc.toString(),
      maxTotalSpendMicroUsdc: buyer.maxTotalSpendMicroUsdc.toString(),
      targetQuantity: buyer.targetQuantity,
      minSlaTier: buyer.minSlaTier,
      maxDeliveryWindowHours: buyer.maxDeliveryWindowHours,
      clampCount: clampCounts.buyer,
    },
    seller: {
      costBasisMicroUsdc: seller.costBasisMicroUsdc.toString(),
      minMarginPct: seller.minMarginPct,
      // DERIVED, never hand-set: cost basis, margin and the terms on the table.
      // That is what makes the margin promise a constraint, not a label.
      derivedFloorMicroUsdc: deriveSellerMinUnitPrice(seller, terms).toString(),
      availableQuantity: seller.availableQuantity,
      maxSlaTier: seller.maxSlaTier,
      minDeliveryWindowHours: seller.minDeliveryWindowHours,
      clampCount: clampCounts.seller,
    },
  };
}

export function toTranscriptRows(
  transcript: readonly Envelope[],
  clamps: readonly {
    seq: number;
    party: string;
    bound: string;
    field: string;
    proposed: string;
    clamped: string;
    explanation: string;
  }[],
  llmRows: readonly {
    seq: number;
    outcome: string;
    rejectedPriceMicroUsdc: string | null;
    finalPriceMicroUsdc: string;
    latencyMs: number;
  }[],
): TranscriptRowView[] {
  return transcript.map((envelope) => {
    const offer = isOfferEnvelope(envelope) ? envelope.offer : null;
    const llm = llmRows.find((row) => row.seq === envelope.seq);

    return {
      seq: envelope.seq,
      round: envelope.round,
      party: envelope.from,
      type: envelope.type,
      unitPriceMicroUsdc: offer?.unitPriceMicroUsdc.toString() ?? null,
      quantity: offer?.quantity ?? null,
      deliveryWindowHours: offer?.terms.deliveryWindowHours ?? null,
      slaTier: offer?.terms.slaTier ?? null,
      rationale: envelope.rationale,
      reasonCode: envelope.type === "WALK_AWAY" ? envelope.reasonCode : null,
      clamps: clamps
        .filter((clamp) => clamp.seq === envelope.seq)
        .map((clamp) => ({
          party: clamp.party,
          bound: clamp.bound,
          field: clamp.field,
          proposed: clamp.proposed,
          clamped: clamp.clamped,
          explanation: clamp.explanation,
        })),
      llm:
        llm === undefined
          ? null
          : {
              outcome: llm.outcome,
              rejectedPriceMicroUsdc: llm.rejectedPriceMicroUsdc,
              finalPriceMicroUsdc: llm.finalPriceMicroUsdc,
              latencyMs: llm.latencyMs,
            },
    };
  });
}

function toSettlementView(db: Database, negotiationId: string): SettlementView | null {
  const deal = new DealRepository(db).findByNegotiation(negotiationId);
  if (deal === undefined) return null;

  const receipt = new SettlementReceiptRepository(db).findByDeal(deal.id);
  if (receipt === undefined) {
    return {
      status: "NOT_ATTEMPTED",
      adapter: "none",
      amountMicroUsdc: deal.amountMicroUsdc.toString(),
      termsHash: deal.termsHash,
      reference: null,
      txHash: null,
      isStub: true,
      explorerUrl: null,
      latencyMs: null,
      error: null,
    };
  }

  return {
    status: receipt.status,
    adapter: receipt.adapter,
    amountMicroUsdc: receipt.amountMicroUsdc.toString(),
    termsHash: receipt.termsHash,
    reference: receipt.reference,
    txHash: receipt.txHash,
    isStub: receipt.isStub,
    explorerUrl: receipt.explorerUrl,
    latencyMs: receipt.latencyMs,
    error: receipt.error,
  };
}

function toPostMortemViews(db: Database, negotiationId: string): PostMortemView[] {
  return new PostMortemRepository(db)
    .listByNegotiation(negotiationId)
    .map((row) => ({
      party: row.party,
      reasonCode: row.reasonCode,
      boundName: row.boundName,
      finalGapMicroUsdc: row.finalGapMicroUsdc,
      roundsUsed: row.roundsUsed,
      zopaExisted: row.zopaExisted,
      explanation: row.explanation,
    }));
}

export function buildNegotiationView(
  db: Database,
  negotiationId: string,
  /**
   * The definition this negotiation actually ran under, for a run whose limits
   * did not come from the scenario table.
   *
   * Every limit and the whole overlap calculation below are read from the
   * definition, not from the ledger, so a custom run rebuilt from `SCENARIOS`
   * would render scenario A's ceiling and floor over somebody else's
   * negotiation: a screen that looks authoritative and is wrong.
   */
  definitionOverride?: ScenarioDefinition,
): NegotiationView {
  const negotiation = new NegotiationRepository(db).findById(negotiationId);
  if (negotiation === undefined) {
    throw new Error(`Unknown negotiation "${negotiationId}".`);
  }
  if (definitionOverride === undefined && !isScenarioName(negotiation.scenario)) {
    throw new Error(
      `Negotiation "${negotiationId}" names scenario "${negotiation.scenario}", ` +
        `which is not one of A, B, C.`,
    );
  }

  const definition =
    definitionOverride ?? SCENARIOS[negotiation.scenario as ScenarioName];
  const transcript = new MessageRepository(db).listByNegotiation(negotiationId);
  const clamps = new ClampEventRepository(db).listByNegotiation(negotiationId);
  const llmRows = new LlmInvocationRepository(db).listByNegotiation(negotiationId);
  const { quantity, terms } = finalTermsAndQuantity(transcript, definition);

  return {
    negotiationId,
    scenario: definition.name,
    roundCap: negotiation.roundCap,
    status:
      negotiation.outcome === "SETTLED"
        ? "SETTLED"
        : negotiation.outcome === "WALKED_AWAY"
          ? "WALKED_AWAY"
          : "RUNNING",
    messages: toTranscriptRows(transcript, clamps, llmRows),
    guardrails: buildGuardrailsView(definition, terms, {
      buyer: clamps.filter((clamp) => clamp.party === "BUYER").length,
      seller: clamps.filter((clamp) => clamp.party === "SELLER").length,
    }),
    observer: buildObserverView(definition, quantity, terms),
    settlement: toSettlementView(db, negotiationId),
    postMortems: toPostMortemViews(db, negotiationId),
  };
}
