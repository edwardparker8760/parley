/**
 * Reads and writes the `negotiations` table.
 *
 * Thin by design: parameterised SQL, no ORM, no query builder.
 */

import type { Database } from "./sqlite-connection.js";

export type NegotiationStatus = "RUNNING" | "COMPLETE";

/** How a negotiation ended. Null while it is still running. */
export type NegotiationOutcome = "SETTLED" | "WALKED_AWAY" | null;

export interface NegotiationRow {
  readonly id: string;
  readonly scenario: string;
  readonly status: NegotiationStatus;
  readonly roundCap: number;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly outcome: NegotiationOutcome;
}

export class NegotiationRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  create(input: {
    id: string;
    scenario: string;
    roundCap: number;
    startedAt: string;
  }): void {
    this.#db
      .prepare(
        `INSERT INTO negotiations (id, scenario, status, round_cap, started_at)
         VALUES (?, ?, 'RUNNING', ?, ?)`,
      )
      .run(input.id, input.scenario, input.roundCap, input.startedAt);
  }

  complete(input: {
    id: string;
    outcome: Exclude<NegotiationOutcome, null>;
    endedAt: string;
  }): void {
    this.#db
      .prepare(
        `UPDATE negotiations
            SET status = 'COMPLETE', outcome = ?, ended_at = ?
          WHERE id = ?`,
      )
      .run(input.outcome, input.endedAt, input.id);
  }

  findById(id: string): NegotiationRow | undefined {
    const row = this.#db
      .prepare(
        `SELECT id, scenario, status, round_cap, started_at, ended_at, outcome
           FROM negotiations WHERE id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    if (row === undefined) return undefined;
    return {
      id: String(row["id"]),
      scenario: String(row["scenario"]),
      status: String(row["status"]) as NegotiationStatus,
      roundCap: Number(row["round_cap"]),
      startedAt: String(row["started_at"]),
      endedAt: row["ended_at"] === null ? null : String(row["ended_at"]),
      outcome:
        row["outcome"] === null
          ? null
          : (String(row["outcome"]) as Exclude<NegotiationOutcome, null>),
    };
  }
}
