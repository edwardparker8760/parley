/**
 * SQLite connection using Node's BUILT-IN `node:sqlite`.
 *
 * Phase 02 planned `better-sqlite3`, which on this machine needs a native
 * compile plus a pnpm build approval: exactly the Windows rabbit hole the
 * phase flagged as day-eating. Node 24 ships `node:sqlite` with prepared
 * statements, parameterised queries, and constraint enforcement, which is
 * everything the ledger needs. Zero dependencies, zero build step.
 *
 * The database file lives in a gitignored path (`*.db` in .gitignore).
 */

import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "./schema-migrations.js";

export type Database = DatabaseSync;

export interface OpenLedgerOptions {
  /** File path, or ":memory:" for tests. */
  readonly location?: string;
}

/** Open a connection and bring the schema up to date. */
export function openLedger(options: OpenLedgerOptions = {}): Database {
  const db = new DatabaseSync(options.location ?? "parley-ledger.db");

  // Foreign keys are OFF by default in SQLite. The messages table references
  // negotiations, and we want an orphaned message to be an error, not data.
  db.exec("PRAGMA foreign_keys = ON");

  applyMigrations(db);
  return db;
}

/** Apply any migration whose version is not yet recorded. Idempotent. */
export function applyMigrations(db: Database): void {
  // The version table is created by migration 1, so it may not exist yet.
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
             version INTEGER PRIMARY KEY,
             name TEXT NOT NULL,
             applied_at TEXT NOT NULL
           )`);

  const applied = new Set(
    db
      .prepare("SELECT version FROM schema_version")
      .all()
      .map((row) => Number((row as { version: number }).version)),
  );

  const record = db.prepare(
    "INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)",
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    for (const statement of migration.statements) {
      db.exec(statement);
    }
    record.run(
      migration.version,
      migration.name,
      new Date().toISOString(),
    );
  }
}
