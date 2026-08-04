/**
 * CLI: export one recorded negotiation from SQLite into the bundled snapshot.
 *
 * Usage:
 *   pnpm --filter @parley/orchestrator export-snapshot <negotiationId> \
 *     [--db parley-ledger.db] [--out apps/web/data/negotiation-snapshot.json]
 *
 * ## Why this exists rather than a hand-written fixture
 *
 * The deployed page shows numbers to strangers. If those numbers were typed by
 * a person they would be a claim about a run rather than a record of one, which
 * is the same integrity failure as a fabricated latency report. Everything in
 * the output comes from the ledger, and the provenance block says which run,
 * when, under what model, and whether any money was real.
 *
 * ## bigint
 *
 * `NegotiationView` is already all strings, because it was designed to cross a
 * JSON boundary to the browser. The one place bigint could sneak in is the
 * provenance, so nothing here reads a raw money column.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DealRepository,
  LlmInvocationRepository,
  NegotiationRepository,
  SettlementReceiptRepository,
  openLedger,
} from "@parley/ledger";
import { buildNegotiationView } from "./build-negotiation-view.js";

const DEFAULT_DB = "parley-ledger.db";
const DEFAULT_OUT = "apps/web/data/negotiation-snapshot.json";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main(): void {
  const negotiationId = process.argv[2];
  if (negotiationId === undefined || negotiationId.startsWith("--")) {
    throw new Error(
      "Usage: export-snapshot <negotiationId> [--db file] [--out file]\n" +
        "Run a scenario first, persisting it with --db, then export it here.",
    );
  }

  const dbPath = flag("--db") ?? DEFAULT_DB;
  const outPath = resolve(flag("--out") ?? DEFAULT_OUT);

  const db = openLedger({ location: dbPath });

  const negotiation = new NegotiationRepository(db).findById(negotiationId);
  if (negotiation === undefined) {
    throw new Error(
      `No negotiation "${negotiationId}" in ${dbPath}. ` +
        `Run one with: pnpm run:scenario A --db ${dbPath}`,
    );
  }

  const view = buildNegotiationView(db, negotiationId);

  // Provenance, every field read from the ledger rather than assumed.
  const llmRows = new LlmInvocationRepository(db).listByNegotiation(negotiationId);
  const deal = new DealRepository(db).findByNegotiation(negotiationId);
  const receipt =
    deal === undefined
      ? undefined
      : new SettlementReceiptRepository(db).findByDeal(deal.id);

  const snapshot = {
    provenance: {
      runId: negotiationId,
      scenario: view.scenario,
      // The strategy is not a ledger column; it is encoded in the id the
      // dashboard mints. Reading it back beats asking the operator to retype it.
      strategy: negotiationId.includes("baseline") ? "baseline" : "engine",
      transcriptClockStartedAt: negotiation.startedAt,
      exportedAt: new Date().toISOString(),
      llmMode: llmRows[0]?.mode ?? "off",
      llmModel: llmRows[0]?.model ?? "",
      llmCallCount: llmRows.length,
      settlementAdapter: receipt?.adapter ?? "none",
      // Defaults to true when there is no receipt at all: absent evidence of
      // real money must never read as evidence of real money.
      settlementIsStub: receipt === undefined ? true : receipt.isStub,
      settlementTxHash: receipt?.txHash ?? null,
      generatedBy: "pnpm --filter @parley/orchestrator export-snapshot",
    },
    view,
  };

  writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  db.close();

  console.log(
    `exported ${negotiationId} to ${outPath}\n` +
      `  scenario   ${snapshot.provenance.scenario} (${snapshot.provenance.strategy})\n` +
      `  messages   ${view.messages.length}\n` +
      `  outcome    ${view.status}\n` +
      `  llm        ${snapshot.provenance.llmMode}, ${snapshot.provenance.llmCallCount} calls\n` +
      `  settlement ${snapshot.provenance.settlementAdapter}` +
      `${snapshot.provenance.settlementIsStub ? " (SIMULATED, no real money)" : ""}`,
  );
}

try {
  main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`export-snapshot failed: ${message}`);
  process.exitCode = 1;
}
