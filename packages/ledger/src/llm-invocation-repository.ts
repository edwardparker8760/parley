/**
 * Persists every LLM consultation, whatever came back.
 *
 * This is the audit trail behind "the LLM proposes, arithmetic disposes". A
 * claim that the model is bounded is worth nothing on its own; a table showing
 * that on seq 7 the model asked for 99999999 and the offer went out at 900
 * anyway is the demonstration.
 *
 * Rows are written for the fallback branches too, including LLM_OFF. A log that
 * only records successful calls hides exactly the cases worth seeing.
 *
 * `rawResponse` is untrusted model output stored verbatim. It is written for
 * debugging and evidence; nothing reads it back into a numeric path, and any
 * renderer must escape it.
 */

import type { Database } from "./sqlite-connection.js";

export type LlmInvocationOutcome =
  | "ACCEPTED"
  | "OUT_OF_BAND"
  | "SCHEMA_INVALID"
  | "TIMEOUT"
  | "ERROR"
  | "LLM_OFF";

export interface LlmInvocationRow {
  readonly negotiationId: string;
  /** The message this consultation produced. Joins to `messages`. */
  readonly seq: number;
  readonly party: string;
  readonly mode: string;
  /** Client name, e.g. "gemini" or "replay". Not the API key. */
  readonly model: string;
  readonly promptHash: string;
  readonly rawResponse: string | null;
  readonly rationale: string;
  readonly outcome: LlmInvocationOutcome;
  readonly fallbackUsed: boolean;
  /** What the model asked for, when arithmetic refused it. */
  readonly rejectedPriceMicroUsdc: string | null;
  readonly finalPriceMicroUsdc: string;
  readonly latencyMs: number;
  readonly createdAt: string;
}

export class LlmInvocationRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  append(row: LlmInvocationRow): void {
    this.#db
      .prepare(
        `INSERT INTO llm_invocations
           (negotiation_id, seq, party, mode, model, prompt_hash, raw_response,
            rationale, outcome, fallback_used, rejected_price_micro_usdc,
            final_price_micro_usdc, latency_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.negotiationId,
        row.seq,
        row.party,
        row.mode,
        row.model,
        row.promptHash,
        row.rawResponse,
        row.rationale,
        row.outcome,
        row.fallbackUsed ? 1 : 0,
        row.rejectedPriceMicroUsdc,
        row.finalPriceMicroUsdc,
        row.latencyMs,
        row.createdAt,
      );
  }

  listByNegotiation(negotiationId: string): LlmInvocationRow[] {
    const rows = this.#db
      .prepare(
        `SELECT negotiation_id, seq, party, mode, model, prompt_hash,
                raw_response, rationale, outcome, fallback_used,
                rejected_price_micro_usdc, final_price_micro_usdc,
                latency_ms, created_at
           FROM llm_invocations
          WHERE negotiation_id = ?
          ORDER BY seq ASC`,
      )
      .all(negotiationId) as Record<string, unknown>[];

    return rows.map((row) => ({
      negotiationId: String(row["negotiation_id"]),
      seq: Number(row["seq"]),
      party: String(row["party"]),
      mode: String(row["mode"]),
      model: String(row["model"]),
      promptHash: String(row["prompt_hash"]),
      rawResponse:
        row["raw_response"] === null ? null : String(row["raw_response"]),
      rationale: String(row["rationale"]),
      outcome: String(row["outcome"]) as LlmInvocationOutcome,
      fallbackUsed: Number(row["fallback_used"]) === 1,
      rejectedPriceMicroUsdc:
        row["rejected_price_micro_usdc"] === null
          ? null
          : String(row["rejected_price_micro_usdc"]),
      finalPriceMicroUsdc: String(row["final_price_micro_usdc"]),
      latencyMs: Number(row["latency_ms"]),
      createdAt: String(row["created_at"]),
    }));
  }

  /** Outcome histogram for a negotiation. Feeds the dashboard and the report. */
  countsByOutcome(negotiationId: string): Record<string, number> {
    const rows = this.#db
      .prepare(
        `SELECT outcome, COUNT(*) AS n
           FROM llm_invocations
          WHERE negotiation_id = ?
          GROUP BY outcome`,
      )
      .all(negotiationId) as { outcome: string; n: number }[];

    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.outcome] = Number(row.n);
    return counts;
  }
}
