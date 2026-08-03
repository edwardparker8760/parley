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
];
