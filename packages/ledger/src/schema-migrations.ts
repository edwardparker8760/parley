/**
 * Ordered schema migrations, applied once each.
 *
 * Plain SQL strings and a version table. No ORM, no migration framework: the
 * schema is three tables and the whole project ships in six days.
 *
 * `decision_states` is split out from `messages` deliberately. The dashboard
 * reads the ladder constantly and does not need the audit payload, so keeping
 * the potentially large state JSON in a separate table keeps the hot read
 * cheap while the audit trail stays complete.
 */

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly statements: readonly string[];
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "initial-negotiation-schema",
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_version (
         version INTEGER PRIMARY KEY,
         name TEXT NOT NULL,
         applied_at TEXT NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS negotiations (
         id TEXT PRIMARY KEY,
         scenario TEXT NOT NULL,
         status TEXT NOT NULL,
         round_cap INTEGER NOT NULL,
         started_at TEXT NOT NULL,
         ended_at TEXT,
         outcome TEXT
       )`,
      `CREATE TABLE IF NOT EXISTS messages (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         negotiation_id TEXT NOT NULL REFERENCES negotiations(id),
         seq INTEGER NOT NULL,
         round INTEGER NOT NULL,
         from_party TEXT NOT NULL,
         type TEXT NOT NULL,
         offer_json TEXT,
         accepts_seq INTEGER,
         reason_code TEXT,
         rationale TEXT NOT NULL,
         created_at TEXT NOT NULL,
         UNIQUE(negotiation_id, seq)
       )`,
      `CREATE TABLE IF NOT EXISTS decision_states (
         message_id INTEGER PRIMARY KEY REFERENCES messages(id),
         state_json TEXT NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_messages_negotiation_seq
         ON messages(negotiation_id, seq)`,
    ],
  },
  {
    version: 2,
    name: "clamp-events",
    statements: [
      // Every time an owner-set limit overrode what a strategy or an LLM
      // proposed. These are demo material: the dashboard renders them as
      // markers and the transcript prints them inline, so the audience sees
      // the guardrail fire rather than being told it exists.
      //
      // `severity` distinguishes a routine clamp (the system working) from a
      // CLAMP_BREACH (the system catching a bug in itself).
      `CREATE TABLE IF NOT EXISTS clamp_events (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         negotiation_id TEXT NOT NULL REFERENCES negotiations(id),
         seq INTEGER NOT NULL,
         party TEXT NOT NULL,
         severity TEXT NOT NULL,
         bound TEXT NOT NULL,
         field TEXT NOT NULL,
         proposed TEXT NOT NULL,
         clamped TEXT NOT NULL,
         explanation TEXT NOT NULL,
         created_at TEXT NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_clamp_events_negotiation_seq
         ON clamp_events(negotiation_id, seq)`,
    ],
  },
  {
    version: 3,
    name: "deals-settlement-receipts-postmortems",
    statements: [
      // One deal per negotiation, frozen at the moment of ACCEPT. The UNIQUE
      // constraint on negotiation_id is the idempotence guard: settling the
      // same negotiation twice cannot create a second payable row.
      `CREATE TABLE IF NOT EXISTS deals (
         id TEXT PRIMARY KEY,
         negotiation_id TEXT NOT NULL UNIQUE REFERENCES negotiations(id),
         accepted_seq INTEGER NOT NULL,
         unit_price_micro_usdc TEXT NOT NULL,
         quantity INTEGER NOT NULL,
         delivery_window_hours INTEGER NOT NULL,
         sla_tier TEXT NOT NULL,
         amount_micro_usdc TEXT NOT NULL,
         terms_hash TEXT NOT NULL,
         created_at TEXT NOT NULL
       )`,
      // `is_stub` is stored, not inferred from the adapter name, because the
      // dashboard's SIMULATED badge reads this column. A receipt that cannot
      // say whether real money moved is worse than no receipt.
      `CREATE TABLE IF NOT EXISTS settlement_receipts (
         deal_id TEXT PRIMARY KEY REFERENCES deals(id),
         status TEXT NOT NULL,
         adapter TEXT NOT NULL,
         reference TEXT,
         tx_hash TEXT,
         amount_micro_usdc TEXT NOT NULL,
         terms_hash TEXT NOT NULL,
         is_stub INTEGER NOT NULL,
         latency_ms INTEGER,
         explorer_url TEXT,
         error TEXT,
         created_at TEXT NOT NULL,
         settled_at TEXT
       )`,
      // Both sides write one row on a walk-away. `zopa_existed` comes from the
      // observer oracle AFTER the negotiation ends, so it cannot leak to an
      // agent, and it is what answers "was a deal ever possible".
      `CREATE TABLE IF NOT EXISTS postmortems (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         negotiation_id TEXT NOT NULL REFERENCES negotiations(id),
         party TEXT NOT NULL,
         reason_code TEXT NOT NULL,
         bound_name TEXT NOT NULL,
         own_band_lo TEXT,
         own_band_hi TEXT,
         counterparty_last_offer TEXT,
         final_gap_micro_usdc TEXT,
         rounds_used INTEGER NOT NULL,
         zopa_existed INTEGER NOT NULL,
         explanation TEXT NOT NULL,
         created_at TEXT NOT NULL,
         UNIQUE(negotiation_id, party)
       )`,
    ],
  },
];
