/**
 * What happens after the last message: settlement on ACCEPT, post-mortems on
 * WALK_AWAY. Never both, and never settlement on a walk-away.
 *
 * Two rules this module exists to enforce:
 *
 *   1. **No payment on any walk-away path.** The settlement adapter is only
 *      reachable from the ACCEPT branch. `no-payment-on-walkaway.test.ts`
 *      proves it with a counting spy rather than trusting this comment.
 *   2. **A settlement failure never corrupts the negotiation record.** The
 *      transcript is already committed by the time this runs; a failed
 *      settlement marks its own receipt FAILED and nothing else.
 *
 * Settlement runs after the turn loop has returned, so a slow batch delays the
 * receipt, never the transcript.
 */

import { explorerTxUrl, multiplyByQuantity } from "@parley/shared";
import type { Terms } from "@parley/shared";
import { isOfferEnvelope } from "@parley/protocol";
import type { Envelope } from "@parley/protocol";
import { computeTermsHash } from "@parley/settlement";
import type { SettlementAdapter } from "@parley/settlement";
import {
  DealRepository,
  PostMortemRepository,
  SettlementReceiptRepository,
} from "@parley/ledger";
import type {
  Database,
  DealRow,
  PostMortemRow,
  SettlementReceiptRow,
} from "@parley/ledger";
import { buildWalkAwayReport } from "./build-walkaway-report.js";
import type { WalkAwayReport, WalkAwayReportInput } from "./build-walkaway-report.js";

export interface FinaliseInput {
  readonly db: Database;
  readonly negotiationId: string;
  readonly transcript: readonly Envelope[];
  readonly terminal: Envelope;
  readonly roundsUsed: number;
  /** Only consulted on ACCEPT. Absent means "record the deal, do not settle". */
  readonly settlement?: SettlementAdapter;
  readonly buyerAddress?: string;
  readonly sellerAddress?: string;
  readonly reportInput: Omit<
    WalkAwayReportInput,
    "negotiationId" | "transcript" | "terminal" | "roundsUsed"
  >;
  readonly now: () => Date;
}

export interface FinaliseResult {
  readonly deal?: DealRow;
  readonly receipt?: SettlementReceiptRow;
  readonly walkAway?: WalkAwayReport;
}

/** The offer an ACCEPT pointed at. Throws if it cannot be found: an ACCEPT
 * that references nothing is a protocol bug, not a settleable deal. */
function findAcceptedOffer(
  transcript: readonly Envelope[],
  acceptsSeq: number,
): { unitPriceMicroUsdc: bigint; quantity: number; terms: Terms } {
  const accepted = transcript.find(
    (envelope) => envelope.seq === acceptsSeq && isOfferEnvelope(envelope),
  );
  if (accepted === undefined || !isOfferEnvelope(accepted)) {
    throw new Error(
      `ACCEPT references seq ${acceptsSeq}, which is not an offer in this ` +
        `transcript. Refusing to settle an unidentifiable deal.`,
    );
  }
  return accepted.offer;
}

async function settleAcceptedDeal(
  input: FinaliseInput,
  acceptsSeq: number,
): Promise<FinaliseResult> {
  const deals = new DealRepository(input.db);
  const receipts = new SettlementReceiptRepository(input.db);

  const agreedOffer = findAcceptedOffer(input.transcript, acceptsSeq);
  const amountMicroUsdc = multiplyByQuantity(
    agreedOffer.unitPriceMicroUsdc,
    agreedOffer.quantity,
  );
  const termsHash = computeTermsHash(input.negotiationId, agreedOffer);
  const createdAt = input.now().toISOString();

  const deal = deals.create({
    id: input.negotiationId,
    negotiationId: input.negotiationId,
    acceptedSeq: acceptsSeq,
    agreedOffer,
    amountMicroUsdc,
    termsHash,
    createdAt,
  });

  if (input.settlement === undefined) {
    return { deal };
  }

  receipts.open({
    dealId: deal.id,
    adapter: input.settlement.name,
    isStub: input.settlement.isStub,
    amountMicroUsdc,
    termsHash,
    createdAt,
  });

  const startedAt = process.hrtime.bigint();
  const elapsedMs = (): number =>
    Number((process.hrtime.bigint() - startedAt) / 1_000_000n);

  try {
    const receipt = await input.settlement.settle({
      dealId: deal.id,
      agreedOffer,
      termsHash,
      buyerAddress: input.buyerAddress ?? "unset",
      sellerAddress: input.sellerAddress ?? "unset",
    });
    receipts.resolve({
      dealId: deal.id,
      // Carried through verbatim, including PENDING. A batch that has not
      // settled yet must not be recorded as settled.
      status: receipt.status,
      reference: receipt.reference,
      txHash: receipt.txHash ?? null,
      latencyMs: elapsedMs(),
      explorerUrl:
        receipt.txHash === undefined ? null : explorerTxUrl(receipt.txHash),
      settledAt: receipt.settledAt,
    });
  } catch (error: unknown) {
    // The error string is persisted, so it must not carry key material. Only
    // the message is taken, never the object, headers, or stack.
    const message = error instanceof Error ? error.message : String(error);
    receipts.resolve({
      dealId: deal.id,
      status: "FAILED",
      latencyMs: elapsedMs(),
      error: message.slice(0, 500),
      settledAt: input.now().toISOString(),
    });
  }

  return { deal, receipt: receipts.findByDeal(deal.id) };
}

function recordWalkAway(input: FinaliseInput): FinaliseResult {
  const report = buildWalkAwayReport({
    ...input.reportInput,
    negotiationId: input.negotiationId,
    transcript: input.transcript,
    terminal: input.terminal,
    roundsUsed: input.roundsUsed,
  });

  const createdAt = input.now().toISOString();
  const toRow = (side: WalkAwayReport["buyer"]): PostMortemRow => ({
    negotiationId: input.negotiationId,
    party: side.party,
    reasonCode: side.postMortem.reasonCode,
    boundName: side.postMortem.boundName,
    ownBandLo: side.postMortem.ownBandLo,
    ownBandHi: side.postMortem.ownBandHi,
    counterpartyLastOffer: side.postMortem.counterpartyLastOffer,
    finalGapMicroUsdc: side.postMortem.finalGapMicroUsdc,
    roundsUsed: side.postMortem.roundsUsed,
    zopaExisted: side.zopaExisted,
    explanation: side.postMortem.explanation,
    createdAt,
  });

  new PostMortemRepository(input.db).insertBoth([
    toRow(report.buyer),
    toRow(report.seller),
  ]);

  return { walkAway: report };
}

/** The single entry point. Dispatches on the terminal message's type. */
export async function finaliseNegotiationOutcome(
  input: FinaliseInput,
): Promise<FinaliseResult> {
  if (input.terminal.type === "ACCEPT") {
    return settleAcceptedDeal(input, input.terminal.acceptsSeq);
  }
  return recordWalkAway(input);
}
