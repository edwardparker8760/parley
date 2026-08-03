/**
 * Persists every envelope with the deterministic state that produced it
 * (spec section 4).
 *
 * The transcript is the primary artefact of the project, so this is the one
 * table whose shape has to be right before phase 05 lands. It has to be
 * replayable from SQLite alone, with no live process.
 *
 * `rationale` is untrusted text from phase 05 onward. It is only ever bound as
 * a parameter, never interpolated.
 */

import { offerToWire, parseEnvelope } from "@parley/protocol";
import type { Envelope } from "@parley/protocol";
import type { Database } from "./sqlite-connection.js";

export class MessageRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  /**
   * Insert an envelope and its decision state atomically.
   *
   * Both rows go in one transaction: a message without its decision state
   * would be an audit gap, and the audit trail is the safety claim.
   */
  append(envelope: Envelope, decisionState: unknown): number {
    const offerJson =
      envelope.type === "OFFER" || envelope.type === "COUNTEROFFER"
        ? JSON.stringify(offerToWire(envelope.offer))
        : null;
    const acceptsSeq = envelope.type === "ACCEPT" ? envelope.acceptsSeq : null;
    const reasonCode =
      envelope.type === "WALK_AWAY" ? envelope.reasonCode : null;

    this.#db.exec("BEGIN");
    try {
      this.#db
        .prepare(
          `INSERT INTO messages
             (negotiation_id, seq, round, from_party, type,
              offer_json, accepts_seq, reason_code, rationale, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          envelope.negotiationId,
          envelope.seq,
          envelope.round,
          envelope.from,
          envelope.type,
          offerJson,
          acceptsSeq,
          reasonCode,
          envelope.rationale,
          envelope.createdAt,
        );

      const messageId = Number(
        (
          this.#db
            .prepare("SELECT last_insert_rowid() AS id")
            .get() as { id: number }
        ).id,
      );

      this.#db
        .prepare(
          `INSERT INTO decision_states (message_id, state_json) VALUES (?, ?)`,
        )
        .run(messageId, JSON.stringify(decisionState ?? null));

      this.#db.exec("COMMIT");
      return messageId;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  /** Full ladder for a negotiation, in seq order, revalidated on the way out. */
  listByNegotiation(negotiationId: string): Envelope[] {
    const rows = this.#db
      .prepare(
        `SELECT negotiation_id, seq, round, from_party, type, offer_json,
                accepts_seq, reason_code, rationale, created_at
           FROM messages
          WHERE negotiation_id = ?
          ORDER BY seq ASC`,
      )
      .all(negotiationId) as Record<string, unknown>[];

    return rows.map((row) => parseEnvelope(rowToEnvelopeInput(row)));
  }

  /** Decision state snapshot for one message, or undefined. */
  findDecisionState(messageId: number): unknown {
    const row = this.#db
      .prepare("SELECT state_json FROM decision_states WHERE message_id = ?")
      .get(messageId) as { state_json: string } | undefined;
    return row === undefined ? undefined : JSON.parse(row.state_json);
  }
}

/** Rebuild the wire shape a row came from, so it can be re-validated. */
function rowToEnvelopeInput(row: Record<string, unknown>): unknown {
  const base = {
    negotiationId: String(row["negotiation_id"]),
    seq: Number(row["seq"]),
    round: Number(row["round"]),
    from: String(row["from_party"]),
    rationale: String(row["rationale"]),
    createdAt: String(row["created_at"]),
  };
  const type = String(row["type"]);

  if (type === "OFFER" || type === "COUNTEROFFER") {
    return { ...base, type, offer: JSON.parse(String(row["offer_json"])) };
  }
  if (type === "ACCEPT") {
    return { ...base, type, acceptsSeq: Number(row["accepts_seq"]) };
  }
  return { ...base, type, reasonCode: String(row["reason_code"]) };
}
