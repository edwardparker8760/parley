/**
 * One place that maps every walk-away trigger to a reason code and a
 * structured post-mortem.
 *
 * Phase 06 renders this payload as the "why we walked" panel, so the shape is
 * fixed here rather than improvised later. It contains our OWN guardrail
 * values, which is fine for the ledger and for the audience but must never be
 * sent to the counterparty. That is why post-mortems are not part of the
 * envelope type.
 */

import type { MicroUsdc } from "@parley/shared";
import type { WalkAwayReason } from "@parley/protocol";
import type { EmptyBandCause } from "@parley/guardrails";

export interface WalkAwayPostMortem {
  readonly reasonCode: WalkAwayReason;
  /** Which owner-set bound was responsible, in plain words. */
  readonly boundName: string;
  readonly ownBandLo: string | null;
  readonly ownBandHi: string | null;
  readonly counterpartyLastOffer: string | null;
  readonly finalGapMicroUsdc: string | null;
  readonly roundsUsed: number;
  /** Audience-facing sentence. */
  readonly explanation: string;
}

export function emptyBandCauseToReason(cause: EmptyBandCause): WalkAwayReason {
  switch (cause) {
    case "BUDGET_BOUND":
      return "NO_ZOPA_BUDGET";
    case "QUANTITY_BOUND":
      return "NO_ZOPA_QUANTITY";
    case "TERMS_BOUND":
    case "PRICE_BOUND":
    default:
      return "NO_ZOPA_PRICE";
  }
}

export function buildPostMortem(input: {
  reasonCode: WalkAwayReason;
  boundName: string;
  ownBandLo: MicroUsdc | null;
  ownBandHi: MicroUsdc | null;
  counterpartyLastOffer: MicroUsdc | null;
  ownLastOffer: MicroUsdc | null;
  roundsUsed: number;
  detail?: string;
}): WalkAwayPostMortem {
  const gap =
    input.counterpartyLastOffer !== null && input.ownLastOffer !== null
      ? input.counterpartyLastOffer > input.ownLastOffer
        ? input.counterpartyLastOffer - input.ownLastOffer
        : input.ownLastOffer - input.counterpartyLastOffer
      : null;

  return {
    reasonCode: input.reasonCode,
    boundName: input.boundName,
    ownBandLo: input.ownBandLo === null ? null : input.ownBandLo.toString(),
    ownBandHi: input.ownBandHi === null ? null : input.ownBandHi.toString(),
    counterpartyLastOffer:
      input.counterpartyLastOffer === null
        ? null
        : input.counterpartyLastOffer.toString(),
    finalGapMicroUsdc: gap === null ? null : gap.toString(),
    roundsUsed: input.roundsUsed,
    explanation:
      input.detail ??
      `${input.boundName} bound after ${input.roundsUsed} rounds` +
        (gap === null ? "" : `, final gap ${gap} micro-USDC`),
  };
}
