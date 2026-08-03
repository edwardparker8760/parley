/**
 * The `postmortems` table: why each side walked away.
 *
 * Two rows per walk-away, one per party, each written from that side's own
 * private view. These rows contain owner-set limits, which is exactly why they
 * are ledger rows and never envelope fields: the audience may see both sides'
 * bands, the counterparty may not.
 *
 * Scenario C is carried entirely by this table plus the absence of a
 * settlement row.
 */

import type { Database } from "./sqlite-connection.js";

export interface PostMortemRow {
  readonly negotiationId: string;
  readonly party: string;
  readonly reasonCode: string;
  readonly boundName: string;
  readonly ownBandLo: string | null;
  readonly ownBandHi: string | null;
  readonly counterpartyLastOffer: string | null;
  readonly finalGapMicroUsdc: string | null;
  readonly roundsUsed: number;
  /** From the observer oracle, written after the negotiation ends. */
  readonly zopaExisted: boolean;
  readonly explanation: string;
  readonly createdAt: string;
}

export class PostMortemRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  insert(row: PostMortemRow): void {
    this.#db
      .prepare(
        `INSERT INTO postmortems
           (negotiation_id, party, reason_code, bound_name, own_band_lo,
            own_band_hi, counterparty_last_offer, final_gap_micro_usdc,
            rounds_used, zopa_existed, explanation, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.negotiationId,
        row.party,
        row.reasonCode,
        row.boundName,
        row.ownBandLo,
        row.ownBandHi,
        row.counterpartyLastOffer,
        row.finalGapMicroUsdc,
        row.roundsUsed,
        row.zopaExisted ? 1 : 0,
        row.explanation,
        row.createdAt,
      );
  }

  insertBoth(rows: readonly PostMortemRow[]): void {
    for (const row of rows) this.insert(row);
  }

  listByNegotiation(negotiationId: string): PostMortemRow[] {
    const rows = this.#db
      .prepare(
        `SELECT negotiation_id, party, reason_code, bound_name, own_band_lo,
                own_band_hi, counterparty_last_offer, final_gap_micro_usdc,
                rounds_used, zopa_existed, explanation, created_at
           FROM postmortems
          WHERE negotiation_id = ?
          ORDER BY party ASC`,
      )
      .all(negotiationId) as Record<string, unknown>[];

    return rows.map((row) => {
      const optional = (key: string): string | null =>
        row[key] === null || row[key] === undefined ? null : String(row[key]);
      return {
        negotiationId: String(row["negotiation_id"]),
        party: String(row["party"]),
        reasonCode: String(row["reason_code"]),
        boundName: String(row["bound_name"]),
        ownBandLo: optional("own_band_lo"),
        ownBandHi: optional("own_band_hi"),
        counterpartyLastOffer: optional("counterparty_last_offer"),
        finalGapMicroUsdc: optional("final_gap_micro_usdc"),
        roundsUsed: Number(row["rounds_used"]),
        zopaExisted: Number(row["zopa_existed"]) === 1,
        explanation: String(row["explanation"]),
        createdAt: String(row["created_at"]),
      };
    });
  }
}
