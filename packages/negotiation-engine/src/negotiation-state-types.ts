/**
 * What an agent knows mid-negotiation. Immutable updates only.
 *
 * Everything here is derived from messages that actually crossed the wire.
 * There is deliberately no field for the counterparty's limits, weights, or
 * band: an agent that cannot represent that information cannot accidentally
 * use it.
 */

import type { MicroUsdc } from "@parley/shared";
import type { Envelope, EnvelopeParty } from "@parley/protocol";

export interface NegotiationState {
  readonly round: number;
  readonly roundCap: number;
  readonly ownOffers: readonly MicroUsdc[];
  /** Counterparty prices, oldest first. Revealed information only. */
  readonly counterpartyOffers: readonly MicroUsdc[];
  /** Absolute price movement by the counterparty, per round. */
  readonly counterpartyDeltas: readonly MicroUsdc[];
  /** Consecutive rounds where the counterparty barely moved. */
  readonly stallCount: number;
}

export function emptyState(round: number, roundCap: number): NegotiationState {
  return {
    round,
    roundCap,
    ownOffers: [],
    counterpartyOffers: [],
    counterpartyDeltas: [],
    stallCount: 0,
  };
}

/** Movement below this fraction of the counterparty's own span counts as a stall. */
export const STALL_THRESHOLD_FRACTION = 0.01;

/** Consecutive stalled rounds before COUNTERPARTY_STALLED fires. */
export const STALL_ROUNDS_BEFORE_WALK_AWAY = 3;

/** Rebuild state from the transcript. Cheap, and avoids mutable bookkeeping. */
export function deriveState(
  history: readonly Envelope[],
  self: EnvelopeParty,
  round: number,
  roundCap: number,
): NegotiationState {
  const ownOffers: MicroUsdc[] = [];
  const counterpartyOffers: MicroUsdc[] = [];

  for (const envelope of history) {
    if (envelope.type !== "OFFER" && envelope.type !== "COUNTEROFFER") continue;
    if (envelope.from === self) ownOffers.push(envelope.offer.unitPriceMicroUsdc);
    else counterpartyOffers.push(envelope.offer.unitPriceMicroUsdc);
  }

  const counterpartyDeltas: MicroUsdc[] = [];
  for (let index = 1; index < counterpartyOffers.length; index += 1) {
    const previous = counterpartyOffers[index - 1] as MicroUsdc;
    const current = counterpartyOffers[index] as MicroUsdc;
    const delta = current - previous;
    counterpartyDeltas.push(delta < 0n ? -delta : delta);
  }

  // Their total span so far, used to judge whether a move was meaningful.
  const first = counterpartyOffers[0];
  const last = counterpartyOffers[counterpartyOffers.length - 1];
  const span =
    first === undefined || last === undefined
      ? 0n
      : last > first
        ? last - first
        : first - last;

  let stallCount = 0;
  for (let index = counterpartyDeltas.length - 1; index >= 0; index -= 1) {
    const delta = counterpartyDeltas[index] as MicroUsdc;
    const threshold =
      span === 0n
        ? 0n
        : (span * BigInt(Math.round(STALL_THRESHOLD_FRACTION * 10_000))) / 10_000n;
    if (delta <= threshold) stallCount += 1;
    else break;
  }

  return {
    round,
    roundCap,
    ownOffers,
    counterpartyOffers,
    counterpartyDeltas,
    stallCount,
  };
}

/**
 * How much the counterparty has conceded, as a fraction of their own span.
 * Feeds the reciprocity term in the concession schedule, so our movement is
 * partly a response to theirs rather than purely a function of our own limit.
 */
export function counterpartyConcessionRatio(state: NegotiationState): number {
  const offers = state.counterpartyOffers;
  if (offers.length < 2) return 0;

  const first = offers[0] as MicroUsdc;
  const last = offers[offers.length - 1] as MicroUsdc;
  const moved = last > first ? last - first : first - last;
  if (moved === 0n) return 0;

  // Normalise against their opening magnitude, the only scale we can see.
  const scale = first < 0n ? -first : first;
  if (scale === 0n) return 0;
  const ratio = Number((moved * 1000n) / scale) / 1000;
  return Math.min(1, Math.max(0, ratio));
}
