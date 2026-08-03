/**
 * OBSERVER-ONLY ZOPA oracle. Knows both sides' private limits.
 *
 * ============================ DO NOT IMPORT ============================
 * NO AGENT MAY IMPORT THIS MODULE. It holds both guardrail sets, so an agent
 * that used it would be reading its counterparty's reservation price, and the
 * information asymmetry the entire product claim rests on would be a lie.
 *
 * `agent-cannot-import-oracle.test.ts` enforces this by scanning source. The
 * rule is easy to break by accident and impossible to notice in a demo, which
 * is exactly why it is a test and not a comment.
 *
 * Its output is for the dashboard and the post-mortems: the audience may see
 * the true ZOPA, because the audience is not a negotiating party. It must
 * never be published on the message bus.
 * =======================================================================
 */

import type { MicroUsdc, Terms } from "@parley/shared";
import { computeFeasibleBand } from "@parley/guardrails";
import type { BuyerGuardrails, SellerGuardrails } from "@parley/guardrails";

export interface ZopaOracleResult {
  readonly exists: boolean;
  readonly loMicroUsdc: MicroUsdc | null;
  readonly hiMicroUsdc: MicroUsdc | null;
  readonly widthMicroUsdc: MicroUsdc | null;
  readonly blockingCause: string | null;
  readonly buyerBand: { lo: MicroUsdc; hi: MicroUsdc | null } | null;
  readonly sellerBand: { lo: MicroUsdc; hi: MicroUsdc | null } | null;
}

/** True overlap of the two bands at a given quantity and terms. */
export function computeTrueZopa(
  buyer: BuyerGuardrails,
  seller: SellerGuardrails,
  quantity: number,
  terms: Terms,
): ZopaOracleResult {
  const buyerBand = computeFeasibleBand(buyer, quantity, terms);
  const sellerBand = computeFeasibleBand(seller, quantity, terms);

  if (buyerBand.empty) {
    return {
      exists: false,
      loMicroUsdc: null,
      hiMicroUsdc: null,
      widthMicroUsdc: null,
      blockingCause: `buyer has no feasible band (${buyerBand.cause}: ${buyerBand.detail})`,
      buyerBand: null,
      sellerBand: sellerBand.empty
        ? null
        : { lo: sellerBand.loMicroUsdc, hi: sellerBand.hiMicroUsdc },
    };
  }
  if (sellerBand.empty) {
    return {
      exists: false,
      loMicroUsdc: null,
      hiMicroUsdc: null,
      widthMicroUsdc: null,
      blockingCause: `seller has no feasible band (${sellerBand.cause}: ${sellerBand.detail})`,
      buyerBand: { lo: buyerBand.loMicroUsdc, hi: buyerBand.hiMicroUsdc },
      sellerBand: null,
    };
  }

  const lo =
    sellerBand.loMicroUsdc > buyerBand.loMicroUsdc
      ? sellerBand.loMicroUsdc
      : buyerBand.loMicroUsdc;

  // The seller's band is unbounded above, so the overlap's ceiling is the
  // buyer's ceiling whenever the buyer has one.
  const hi =
    buyerBand.hiMicroUsdc === null
      ? sellerBand.hiMicroUsdc
      : sellerBand.hiMicroUsdc === null
        ? buyerBand.hiMicroUsdc
        : buyerBand.hiMicroUsdc < sellerBand.hiMicroUsdc
          ? buyerBand.hiMicroUsdc
          : sellerBand.hiMicroUsdc;

  const bands = {
    buyerBand: { lo: buyerBand.loMicroUsdc, hi: buyerBand.hiMicroUsdc },
    sellerBand: { lo: sellerBand.loMicroUsdc, hi: sellerBand.hiMicroUsdc },
  };

  if (hi !== null && lo > hi) {
    return {
      exists: false,
      loMicroUsdc: null,
      hiMicroUsdc: null,
      widthMicroUsdc: null,
      blockingCause:
        `seller floor ${sellerBand.loMicroUsdc} exceeds buyer ceiling ` +
        `${buyerBand.hiMicroUsdc}: no price satisfies both owners`,
      ...bands,
    };
  }

  return {
    exists: true,
    loMicroUsdc: lo,
    hiMicroUsdc: hi,
    widthMicroUsdc: hi === null ? null : hi - lo,
    blockingCause: null,
    ...bands,
  };
}
