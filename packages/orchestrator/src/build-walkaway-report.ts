/**
 * Builds both sides' walk-away post-mortems once a negotiation has ended.
 *
 * This runs in the ORCHESTRATOR, not in an agent, for two reasons. It needs
 * both guardrail sets, and it uses the observer ZOPA oracle to answer "was a
 * deal ever possible" (`zopaExisted`). An agent holding either of those would
 * be reading its counterparty's reservation price, which is the one thing the
 * product claim rests on not happening. It also runs strictly AFTER the
 * terminal message, so nothing it computes can reach the wire.
 *
 * Each side's post-mortem is built from that side's OWN band and the
 * counterparty's REVEALED offers only, which is exactly the view that side had
 * while negotiating. The oracle result is appended as a separate field rather
 * than mixed into the reasoning, so the two remain distinguishable.
 */

import { computeFeasibleBand } from "@parley/guardrails";
import type { BuyerGuardrails, SellerGuardrails } from "@parley/guardrails";
import { isOfferEnvelope } from "@parley/protocol";
import type { Envelope, EnvelopeParty, WalkAwayReason } from "@parley/protocol";
import { computeTrueZopa } from "@parley/negotiation-engine/oracle";
import type { ZopaOracleResult } from "@parley/negotiation-engine/oracle";
import { buildPostMortem, emptyBandCauseToReason } from "@parley/negotiation-engine";
import type { WalkAwayPostMortem } from "@parley/negotiation-engine";
import type { MicroUsdc, Terms } from "@parley/shared";

export interface WalkAwayReportInput {
  readonly negotiationId: string;
  readonly transcript: readonly Envelope[];
  /** The WALK_AWAY that ended the negotiation. */
  readonly terminal: Envelope;
  readonly buyerGuardrails: BuyerGuardrails;
  readonly sellerGuardrails: SellerGuardrails;
  /** Quantity and terms the bands are evaluated at: the last ones on the table. */
  readonly quantity: number;
  readonly terms: Terms;
  readonly roundsUsed: number;
}

export interface PartyWalkAwayReport {
  readonly party: EnvelopeParty;
  readonly postMortem: WalkAwayPostMortem;
  /** Observer truth, not agent belief. */
  readonly zopaExisted: boolean;
}

export interface WalkAwayReport {
  readonly buyer: PartyWalkAwayReport;
  readonly seller: PartyWalkAwayReport;
  readonly zopa: ZopaOracleResult;
}

/** Last price this party actually put on the wire, if any. */
function lastOfferBy(
  transcript: readonly Envelope[],
  party: EnvelopeParty,
): MicroUsdc | null {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const envelope = transcript[index];
    if (envelope !== undefined && envelope.from === party && isOfferEnvelope(envelope)) {
      return envelope.offer.unitPriceMicroUsdc;
    }
  }
  return null;
}

/** Plain-words name of the bound that actually held this side back. */
function boundNameFor(party: EnvelopeParty, emptyCause: string | null): string {
  if (emptyCause !== null) return `${party.toLowerCase()} ${emptyCause}`;
  return party === "BUYER"
    ? "buyer maximum unit price and total spend cap"
    : "seller margin floor over cost basis";
}

function reportFor(
  party: EnvelopeParty,
  input: WalkAwayReportInput,
  zopa: ZopaOracleResult,
): PartyWalkAwayReport {
  const guardrails: BuyerGuardrails | SellerGuardrails =
    party === "BUYER" ? input.buyerGuardrails : input.sellerGuardrails;
  const band = computeFeasibleBand(guardrails, input.quantity, input.terms);
  const counterparty: EnvelopeParty = party === "BUYER" ? "SELLER" : "BUYER";

  // The party that actually walked owns its own reason code. The other side is
  // attributed the structural reason: if no ZOPA existed, no counter it could
  // have made would have helped, and saying so is the honest reading.
  const walkedHere =
    input.terminal.type === "WALK_AWAY" && input.terminal.from === party;
  const reasonCode: WalkAwayReason = walkedHere
    ? input.terminal.reasonCode
    : band.empty
      ? emptyBandCauseToReason(band.cause)
      : zopa.exists
        ? "ROUND_CAP_REACHED"
        : "NO_ZOPA_PRICE";

  return {
    party,
    zopaExisted: zopa.exists,
    postMortem: buildPostMortem({
      reasonCode,
      boundName: boundNameFor(party, band.empty ? band.cause : null),
      ownBandLo: band.empty ? null : band.loMicroUsdc,
      ownBandHi: band.empty ? null : band.hiMicroUsdc,
      counterpartyLastOffer: lastOfferBy(input.transcript, counterparty),
      ownLastOffer: lastOfferBy(input.transcript, party),
      roundsUsed: input.roundsUsed,
    }),
  };
}

export function buildWalkAwayReport(input: WalkAwayReportInput): WalkAwayReport {
  const zopa = computeTrueZopa(
    input.buyerGuardrails,
    input.sellerGuardrails,
    input.quantity,
    input.terms,
  );

  return {
    buyer: reportFor("BUYER", input, zopa),
    seller: reportFor("SELLER", input, zopa),
    zopa,
  };
}
