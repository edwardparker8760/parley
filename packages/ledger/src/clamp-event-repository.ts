/**
 * Persists guardrail clamp events.
 *
 * These rows are the evidence behind the safety claim. A demo that says "the
 * guardrails bind" is an assertion; a transcript line saying the seller
 * proposed 700 and arithmetic forced it to 1150 because the owner's margin
 * floor said so is a demonstration.
 *
 * The ledger deliberately stores the value the party PROPOSED alongside the
 * value it was forced to. Storing only the final value would lose exactly the
 * information that makes the clamp visible.
 */

import type { Database } from "./sqlite-connection.js";

/** Routine clamp, or the egress guard catching an actual breach. */
export type ClampSeverity = "CLAMP" | "BREACH";

export interface ClampEventRow {
  readonly negotiationId: string;
  readonly seq: number;
  readonly party: string;
  readonly severity: ClampSeverity;
  readonly bound: string;
  readonly field: string;
  readonly proposed: string;
  readonly clamped: string;
  readonly explanation: string;
  readonly createdAt: string;
}

export class ClampEventRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  append(event: ClampEventRow): void {
    this.#db
      .prepare(
        `INSERT INTO clamp_events
           (negotiation_id, seq, party, severity, bound, field,
            proposed, clamped, explanation, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.negotiationId,
        event.seq,
        event.party,
        event.severity,
        event.bound,
        event.field,
        event.proposed,
        event.clamped,
        event.explanation,
        event.createdAt,
      );
  }

  appendMany(events: readonly ClampEventRow[]): void {
    for (const event of events) this.append(event);
  }

  listByNegotiation(negotiationId: string): ClampEventRow[] {
    const rows = this.#db
      .prepare(
        `SELECT negotiation_id, seq, party, severity, bound, field,
                proposed, clamped, explanation, created_at
           FROM clamp_events
          WHERE negotiation_id = ?
          ORDER BY seq ASC, id ASC`,
      )
      .all(negotiationId) as Record<string, unknown>[];

    return rows.map((row) => ({
      negotiationId: String(row["negotiation_id"]),
      seq: Number(row["seq"]),
      party: String(row["party"]),
      severity: String(row["severity"]) as ClampSeverity,
      bound: String(row["bound"]),
      field: String(row["field"]),
      proposed: String(row["proposed"]),
      clamped: String(row["clamped"]),
      explanation: String(row["explanation"]),
      createdAt: String(row["created_at"]),
    }));
  }

  countByNegotiation(negotiationId: string): number {
    const row = this.#db
      .prepare(
        "SELECT COUNT(*) AS n FROM clamp_events WHERE negotiation_id = ?",
      )
      .get(negotiationId) as { n: number };
    return Number(row.n);
  }
}
