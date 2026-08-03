/**
 * The negotiation wire format (spec section 4).
 *
 * This module is a trust boundary. Validation runs on BOTH publish and
 * receive, so a malformed or hostile message can never reach agent logic.
 * From phase 05 onward `rationale` is LLM-written and therefore untrusted
 * text: it is length-capped, stripped of control characters here, and is
 * forbidden from reaching any deterministic computation.
 *
 * `unitPriceMicroUsdc` travels as a decimal STRING because bigint is not
 * JSON-serialisable. It is parsed to bigint exactly once, here, at the
 * boundary. Nothing downstream should ever parse it again.
 */

import { z } from "zod";
import type { Offer, SlaTier } from "@parley/shared";
import { WALK_AWAY_REASONS } from "./walk-away-reason-codes.js";
import type { WalkAwayReason } from "./walk-away-reason-codes.js";

export const PARTIES = ["BUYER", "SELLER"] as const;
export type EnvelopeParty = (typeof PARTIES)[number];

export const MESSAGE_TYPES = [
  "OFFER",
  "COUNTEROFFER",
  "ACCEPT",
  "WALK_AWAY",
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

/** Rationale is audience-facing prose. Capped so it cannot become a payload. */
export const MAX_RATIONALE_LENGTH = 240;

/**
 * Collapse control characters and runs of whitespace.
 *
 * Untrusted text reaches logs, SQLite, and the dashboard. A raw newline or
 * escape sequence inside a rationale could forge a log line or corrupt
 * terminal output during the demo, so control characters never survive here.
 */
const CONTROL_CHARACTERS = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

function sanitiseRationale(raw: string): string {
  return raw.replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim();
}

const rationaleSchema = z
  .string()
  .max(MAX_RATIONALE_LENGTH)
  .transform(sanitiseRationale);

const slaTierSchema = z.enum(["basic", "standard", "premium"]);

/** Decimal string, parsed to bigint at this boundary and nowhere else. */
const microUsdcStringSchema = z
  .string()
  .regex(/^\d+$/, "unitPriceMicroUsdc must be a non-negative integer string")
  .transform((value) => BigInt(value));

const offerSchema = z.object({
  unitPriceMicroUsdc: microUsdcStringSchema,
  quantity: z.number().int().nonnegative(),
  terms: z.object({
    deliveryWindowHours: z.number().int().positive(),
    slaTier: slaTierSchema,
  }),
});

const envelopeBase = {
  negotiationId: z.string().min(1),
  /** 1-based, increments per full buyer-plus-seller exchange. */
  round: z.number().int().positive(),
  /** Strictly increasing within a negotiation. Assigned by the turn loop. */
  seq: z.number().int().nonnegative(),
  from: z.enum(PARTIES),
  rationale: rationaleSchema,
  createdAt: z.string().min(1),
};

/**
 * Discriminated union on `type`. Each variant carries exactly the fields its
 * type requires, so an ACCEPT cannot smuggle an offer and a WALK_AWAY cannot
 * omit its reason.
 */
export const envelopeSchema = z.discriminatedUnion("type", [
  z.object({ ...envelopeBase, type: z.literal("OFFER"), offer: offerSchema }),
  z.object({
    ...envelopeBase,
    type: z.literal("COUNTEROFFER"),
    offer: offerSchema,
  }),
  z.object({
    ...envelopeBase,
    type: z.literal("ACCEPT"),
    acceptsSeq: z.number().int().nonnegative(),
  }),
  z.object({
    ...envelopeBase,
    type: z.literal("WALK_AWAY"),
    reasonCode: z.enum(WALK_AWAY_REASONS),
  }),
]);

export type Envelope = z.infer<typeof envelopeSchema>;

/** Envelopes that carry a price, narrowed for convenience. */
export type OfferEnvelope = Extract<
  Envelope,
  { type: "OFFER" | "COUNTEROFFER" }
>;

export function isOfferEnvelope(
  envelope: Envelope,
): envelope is OfferEnvelope {
  return envelope.type === "OFFER" || envelope.type === "COUNTEROFFER";
}

export function isTerminal(envelope: Envelope): boolean {
  return envelope.type === "ACCEPT" || envelope.type === "WALK_AWAY";
}

/** Parse and validate. Throws ZodError on anything malformed. */
export function parseEnvelope(input: unknown): Envelope {
  return envelopeSchema.parse(input);
}

/**
 * Serialise for the wire or for SQLite. bigint becomes a decimal string,
 * mirroring `microUsdcStringSchema` exactly so a round trip is lossless.
 */
export function serialiseEnvelope(envelope: Envelope): string {
  return JSON.stringify(envelope, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

/** Build the wire-shaped offer object from a domain Offer. */
export function offerToWire(offer: Offer): {
  unitPriceMicroUsdc: string;
  quantity: number;
  terms: { deliveryWindowHours: number; slaTier: SlaTier };
} {
  return {
    unitPriceMicroUsdc: offer.unitPriceMicroUsdc.toString(),
    quantity: offer.quantity,
    terms: {
      deliveryWindowHours: offer.terms.deliveryWindowHours,
      slaTier: offer.terms.slaTier,
    },
  };
}

export type { WalkAwayReason };
