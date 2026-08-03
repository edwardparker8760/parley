/**
 * CLI: reconstruct a negotiation ladder from SQLite alone, process cold.
 *
 * Usage: pnpm replay <negotiationId> [--db parley-ledger.db]
 *
 * This must produce output byte-identical to the live run (phase 02 success
 * criterion 3), which is why it calls the same `renderLadder` the live path
 * uses rather than reimplementing the formatting.
 */

import { openLedger, replayNegotiation } from "@parley/ledger";

function main(): void {
  const negotiationId = process.argv[2];
  if (negotiationId === undefined || negotiationId.startsWith("--")) {
    throw new Error("Usage: pnpm replay <negotiationId> [--db <file>]");
  }

  const dbFlagIndex = process.argv.indexOf("--db");
  const location =
    dbFlagIndex >= 0 ? process.argv[dbFlagIndex + 1] : "parley-ledger.db";

  const db = openLedger({ location });
  console.log(replayNegotiation(db, negotiationId));
}

try {
  main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`replay failed: ${message}`);
  process.exitCode = 1;
}
