/**
 * The `settlement_receipts` table: what happened to the money, if anything.
 *
 * Three real states plus the stub's own terminal state, and no more. A receipt
 * is opened as PENDING before the adapter is called and updated once when it
 * resolves, so a settlement that hangs is visibly pending rather than absent.
 *
 * `isStub` and `adapter` are both persisted. The dashboard renders a SIMULATED
 * badge from `isStub`; treating that badge as optional decoration is how a
 * stubbed settlement ends up looking real in a video.
 */

import type { MicroUsdc } from "@parley/shared";
import type { Database } from "./sqlite-connection.js";

export type ReceiptStatus =
  | "PENDING"
  | "SETTLED"
  | "SETTLED_STUB"
  | "FAILED";

export interface SettlementReceiptRow {
  readonly dealId: string;
  readonly status: ReceiptStatus;
  readonly adapter: string;
  readonly reference: string | null;
  readonly txHash: string | null;
  readonly amountMicroUsdc: MicroUsdc;
  readonly termsHash: string;
  readonly isStub: boolean;
  readonly latencyMs: number | null;
  readonly explorerUrl: string | null;
  readonly error: string | null;
  readonly createdAt: string;
  readonly settledAt: string | null;
}

export interface ResolveReceiptInput {
  readonly dealId: string;
  /**
   * PENDING is legal here: a real batch can return an authorisation that has
   * not settled yet, and the honest record of that is a receipt that still
   * says PENDING but now carries its reference and its measured latency.
   */
  readonly status: ReceiptStatus;
  readonly reference?: string | null;
  readonly txHash?: string | null;
  readonly latencyMs: number;
  readonly explorerUrl?: string | null;
  readonly error?: string | null;
  readonly settledAt: string;
}

export class SettlementReceiptRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  /** Opens the receipt in PENDING, before the adapter is called. */
  open(input: {
    dealId: string;
    adapter: string;
    isStub: boolean;
    amountMicroUsdc: MicroUsdc;
    termsHash: string;
    createdAt: string;
  }): void {
    this.#db
      .prepare(
        `INSERT INTO settlement_receipts
           (deal_id, status, adapter, amount_micro_usdc, terms_hash, is_stub,
            created_at)
         VALUES (?, 'PENDING', ?, ?, ?, ?, ?)`,
      )
      .run(
        input.dealId,
        input.adapter,
        input.amountMicroUsdc.toString(),
        input.termsHash,
        input.isStub ? 1 : 0,
        input.createdAt,
      );
  }

  /** Single terminal update. A receipt resolves exactly once. */
  resolve(input: ResolveReceiptInput): void {
    this.#db
      .prepare(
        `UPDATE settlement_receipts
            SET status = ?, reference = ?, tx_hash = ?, latency_ms = ?,
                explorer_url = ?, error = ?, settled_at = ?
          WHERE deal_id = ? AND status = 'PENDING'`,
      )
      .run(
        input.status,
        input.reference ?? null,
        input.txHash ?? null,
        input.latencyMs,
        input.explorerUrl ?? null,
        input.error ?? null,
        input.settledAt,
        input.dealId,
      );
  }

  findByDeal(dealId: string): SettlementReceiptRow | undefined {
    const row = this.#db
      .prepare(
        `SELECT deal_id, status, adapter, reference, tx_hash,
                amount_micro_usdc, terms_hash, is_stub, latency_ms,
                explorer_url, error, created_at, settled_at
           FROM settlement_receipts WHERE deal_id = ?`,
      )
      .get(dealId) as Record<string, unknown> | undefined;
    if (row === undefined) return undefined;

    const optional = (key: string): string | null =>
      row[key] === null || row[key] === undefined ? null : String(row[key]);

    return {
      dealId: String(row["deal_id"]),
      status: String(row["status"]) as ReceiptStatus,
      adapter: String(row["adapter"]),
      reference: optional("reference"),
      txHash: optional("tx_hash"),
      amountMicroUsdc: BigInt(String(row["amount_micro_usdc"])),
      termsHash: String(row["terms_hash"]),
      isStub: Number(row["is_stub"]) === 1,
      latencyMs: row["latency_ms"] === null ? null : Number(row["latency_ms"]),
      explorerUrl: optional("explorer_url"),
      error: optional("error"),
      createdAt: String(row["created_at"]),
      settledAt: optional("settled_at"),
    };
  }
}
