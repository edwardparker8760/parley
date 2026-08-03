/**
 * Clamp events: the visible proof that a guardrail bound something.
 *
 * These are demo material as much as audit material. Every time arithmetic
 * overrides what a strategy (phase 04) or an LLM (phase 05) proposed, an event
 * is recorded with the proposed value, the value it was forced to, and which
 * owner-set bound did the forcing. The dashboard renders these as markers and
 * the transcript prints them inline, so the audience SEES the guardrail fire
 * rather than being told it exists.
 */

import type { MicroUsdc } from "@parley/shared";
import type { EnvelopeParty } from "@parley/protocol";

/** Which owner-set bound bit. */
export type ClampBound =
  | "MAX_UNIT_PRICE"
  | "MIN_UNIT_PRICE_FROM_MARGIN"
  | "MAX_TOTAL_SPEND"
  | "MIN_QUANTITY"
  | "MAX_QUANTITY_AVAILABLE"
  | "MIN_SLA_TIER"
  | "MAX_SLA_TIER"
  | "MAX_DELIVERY_WINDOW"
  | "MIN_DELIVERY_WINDOW"
  /** A side wanted to ACCEPT an offer outside its own band, and was refused. */
  | "BAND_ON_ACCEPT"
  /** No legal offer exists at all for this quantity and these terms. */
  | "BAND_EMPTY";

/** What kind of value was clamped, so the UI can format it. */
export type ClampedField = "unitPrice" | "quantity" | "slaTier" | "deliveryWindowHours";

export interface ClampEvent {
  readonly party: EnvelopeParty;
  readonly bound: ClampBound;
  readonly field: ClampedField;
  /** What was proposed, as a display string. */
  readonly proposed: string;
  /** What the arithmetic forced it to. */
  readonly clamped: string;
  /** One line, audience-facing. */
  readonly explanation: string;
}

/** Why no legal offer exists for this side at this quantity and these terms. */
export type EmptyBandCause =
  | "PRICE_BOUND"
  | "BUDGET_BOUND"
  | "QUANTITY_BOUND"
  | "TERMS_BOUND";

/**
 * A closed interval of legal unit prices. `hi === null` means unbounded above,
 * which is the seller's normal case: an owner sets a floor, not a ceiling.
 */
export interface FeasibleBand {
  readonly loMicroUsdc: MicroUsdc;
  readonly hiMicroUsdc: MicroUsdc | null;
}

export type BandResult =
  | ({ readonly empty: false } & FeasibleBand)
  | { readonly empty: true; readonly cause: EmptyBandCause; readonly detail: string };

export type ClampResult =
  | {
      readonly ok: true;
      readonly offer: import("@parley/shared").Offer;
      readonly clampsApplied: readonly ClampEvent[];
    }
  | {
      readonly ok: false;
      readonly reason: "NO_FEASIBLE_OFFER";
      readonly cause: EmptyBandCause;
      readonly detail: string;
    };

/**
 * Thrown when a message that is outside its sender's own band reaches the bus.
 *
 * FAIL CLOSED. This is never caught and continued: reaching it means the clamp
 * is broken, and a broken clamp invalidates the entire safety claim. Better to
 * abort the negotiation loudly than to ship a deal that breached an owner's
 * limit.
 */
export class ClampBreachError extends Error {
  readonly party: EnvelopeParty;
  readonly bound: ClampBound | "BAND";
  readonly detail: string;

  constructor(input: {
    party: EnvelopeParty;
    bound: ClampBound | "BAND";
    detail: string;
  }) {
    super(
      `Guardrail breach by ${input.party} (${input.bound}): ${input.detail}. ` +
        `A message outside the sender's own feasible band reached the bus. ` +
        `This is a bug in the clamp, not a negotiation outcome.`,
    );
    this.name = "ClampBreachError";
    this.party = input.party;
    this.bound = input.bound;
    this.detail = input.detail;
  }
}
