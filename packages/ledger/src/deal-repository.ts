/**
 * The `deals` table: what was agreed, frozen at ACCEPT.
 *
 * A deal row is created BEFORE any settlement call, so a settlement that fails
 * or never resolves still leaves a complete record of what the two agents
 * agreed to. The negotiation transcript and the payment are separable; that is
 * deliberate (spec section 6).
 *
 * Money is stored as a decimal TEXT string and read back as bigint. No float
 * ever touches an amount, not even in transit through SQLite, which types
 * large integers as doubles.
 */

import type { MicroUsdc, Offer, SlaTier } from "@parley/shared";
import type { Database } from "./sqlite-connection.js";

export interface DealRow {
  readonly id: string;
  readonly negotiationId: string;
  /** Seq of the offer the ACCEPT pointed at. */
  readonly acceptedSeq: number;
  readonly unitPriceMicroUsdc: MicroUsdc;
  readonly quantity: number;
  readonly deliveryWindowHours: number;
  readonly slaTier: SlaTier;
  /** unitPrice * quantity, computed once, here. */
  readonly amountMicroUsdc: MicroUsdc;
  readonly termsHash: string;
  readonly createdAt: string;
}

export interface CreateDealInput {
  readonly id: string;
  readonly negotiationId: string;
  readonly acceptedSeq: number;
  readonly agreedOffer: Offer;
  readonly amountMicroUsdc: MicroUsdc;
  readonly termsHash: string;
  readonly createdAt: string;
}

export class DealRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  /**
   * Insert the agreed deal. Throws on a duplicate negotiation_id rather than
   * updating: a second deal for the same negotiation means something upstream
   * ran the ACCEPT hook twice, and paying twice is the failure to avoid.
   */
  create(input: CreateDealInput): DealRow {
    this.#db
      .prepare(
        `INSERT INTO deals
           (id, negotiation_id, accepted_seq, unit_price_micro_usdc, quantity,
            delivery_window_hours, sla_tier, amount_micro_usdc, terms_hash,
            created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.negotiationId,
        input.acceptedSeq,
        input.agreedOffer.unitPriceMicroUsdc.toString(),
        input.agreedOffer.quantity,
        input.agreedOffer.terms.deliveryWindowHours,
        input.agreedOffer.terms.slaTier,
        input.amountMicroUsdc.toString(),
        input.termsHash,
        input.createdAt,
      );

    return {
      id: input.id,
      negotiationId: input.negotiationId,
      acceptedSeq: input.acceptedSeq,
      unitPriceMicroUsdc: input.agreedOffer.unitPriceMicroUsdc,
      quantity: input.agreedOffer.quantity,
      deliveryWindowHours: input.agreedOffer.terms.deliveryWindowHours,
      slaTier: input.agreedOffer.terms.slaTier,
      amountMicroUsdc: input.amountMicroUsdc,
      termsHash: input.termsHash,
      createdAt: input.createdAt,
    };
  }

  /**
   * Look up a deal by its own id.
   *
   * Used by the seller's 402-protected endpoint: the buyer names a deal, and
   * the seller prices the request from ITS OWN copy of the deal row rather
   * than from anything the buyer sent. That is what stops a buyer paying less
   * than it agreed to.
   */
  findById(dealId: string): DealRow | undefined {
    const row = this.#db
      .prepare(
        `SELECT id, negotiation_id, accepted_seq, unit_price_micro_usdc,
                quantity, delivery_window_hours, sla_tier, amount_micro_usdc,
                terms_hash, created_at
           FROM deals WHERE id = ?`,
      )
      .get(dealId) as Record<string, unknown> | undefined;
    return row === undefined ? undefined : toDealRow(row);
  }

  findByNegotiation(negotiationId: string): DealRow | undefined {
    const row = this.#db
      .prepare(
        `SELECT id, negotiation_id, accepted_seq, unit_price_micro_usdc,
                quantity, delivery_window_hours, sla_tier, amount_micro_usdc,
                terms_hash, created_at
           FROM deals WHERE negotiation_id = ?`,
      )
      .get(negotiationId) as Record<string, unknown> | undefined;
    return row === undefined ? undefined : toDealRow(row);
  }
}

function toDealRow(row: Record<string, unknown>): DealRow {
  return {
    id: String(row["id"]),
    negotiationId: String(row["negotiation_id"]),
    acceptedSeq: Number(row["accepted_seq"]),
    unitPriceMicroUsdc: BigInt(String(row["unit_price_micro_usdc"])),
    quantity: Number(row["quantity"]),
    deliveryWindowHours: Number(row["delivery_window_hours"]),
    slaTier: String(row["sla_tier"]) as SlaTier,
    amountMicroUsdc: BigInt(String(row["amount_micro_usdc"])),
    termsHash: String(row["terms_hash"]),
    createdAt: String(row["created_at"]),
  };
}
