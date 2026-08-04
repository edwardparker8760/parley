/**
 * Holds the negotiations this server has run, so the stream and the cold read
 * can both see them.
 *
 * ## One connection, deliberately
 *
 * A live run and the SSE stream share the SAME database handle. The alternative
 * (write from one connection, poll from another) means reading a file whose
 * writer has not necessarily flushed, which produces a ladder that stutters or
 * arrives all at once. Same process, same handle, no coordination needed.
 *
 * ## Why a module-level map survives Next
 *
 * Next's dev server re-evaluates route modules on change, which would drop a
 * plain module-level variable and orphan a running negotiation. Stashing it on
 * `globalThis` is the standard escape hatch and is the reason a negotiation
 * started before an edit is still streamable after one.
 */

import { openLedger } from "@parley/ledger";
import type { Database } from "@parley/ledger";
import { buildNegotiationView, runScenario } from "@parley/orchestrator";
import type { NegotiationView, ScenarioName } from "@parley/orchestrator";
import { loadConfigFromEnv } from "@parley/shared";
import { createSettlementAdapter } from "@parley/settlement";

/** Reading speed for the ladder. Presentation only; the ledger is unaffected. */
const TURN_DELAY_MS = 550;

interface RunRecord {
  readonly negotiationId: string;
  readonly db: Database;
  readonly finished: Promise<void>;
  error: string | null;
}

interface Registry {
  readonly runs: Map<string, RunRecord>;
  ledger: Database | null;
}

const KEY = Symbol.for("parley.dashboard.registry");

function registry(): Registry {
  const container = globalThis as unknown as Record<symbol, Registry | undefined>;
  const existing = container[KEY];
  if (existing !== undefined) return existing;
  const created: Registry = { runs: new Map(), ledger: null };
  container[KEY] = created;
  return created;
}

/**
 * The shared on-disk ledger.
 *
 * On disk rather than in memory so a negotiation survives a dev-server reload
 * and so `/?negotiation=<id>` still works tomorrow. This is the same file the
 * CLI writes with `--db`, so a run recorded from the terminal is replayable in
 * the browser and vice versa.
 */
export function sharedLedger(): Database {
  const state = registry();
  if (state.ledger === null) {
    state.ledger = openLedger({
      location: process.env["PARLEY_LEDGER"] ?? "parley-ledger.db",
    });
  }
  return state.ledger;
}

export function startScenarioRun(
  scenario: ScenarioName,
  strategy: "engine" | "baseline" = "engine",
): string {
  const db = sharedLedger();
  const negotiationId = `${scenario.toLowerCase()}-${strategy}-${Date.now().toString(36)}`;

  const record: RunRecord = {
    negotiationId,
    db,
    error: null,
    // Started, not awaited. The route returns the id immediately so the browser
    // can begin streaming while the negotiation is still being written.
    finished: runScenario({
      scenario,
      negotiationId,
      db,
      strategy,
      turnDelayMs: TURN_DELAY_MS,
      // Fresh ledger id every run, identical negotiation every run.
      //
      // The value is the id the CLI and the test suite use, so the browser
      // reproduces exactly the negotiation `scenario-outcomes match their
      // stated expectations` asserts on. That is not cosmetic: scenario B's
      // ZOPA is narrow enough that a different jitter stream flips it from
      // settling to walking away, and a demo whose outcome depends on a
      // timestamp is not a demo.
      seedKey: `${scenario.toLowerCase()}-negotiation`,
      // Whatever SETTLEMENT_MODE says, and it fails loudly rather than
      // downgrading. On the default stub the panel shows SIMULATED, which is
      // the point: the badge has to come from a real receipt, not from a
      // hardcoded flag in the UI.
      settlement: createSettlementAdapter(loadConfigFromEnv()),
    })
      .then(() => undefined)
      .catch((error: unknown) => {
        record.error = error instanceof Error ? error.message : String(error);
      }),
  };

  registry().runs.set(negotiationId, record);
  return negotiationId;
}

/**
 * Reads a live run from the ledger.
 *
 * Only the sqlite path calls this. A snapshot deployment never reaches this
 * module: `select-negotiation-source` imports it lazily, so `better-sqlite3`
 * stays out of the module graph entirely when the snapshot source is selected.
 */
export function readNegotiationView(negotiationId: string): NegotiationView {
  const record = registry().runs.get(negotiationId);
  return buildNegotiationView(record?.db ?? sharedLedger(), negotiationId);
}

export function runError(negotiationId: string): string | null {
  return registry().runs.get(negotiationId)?.error ?? null;
}
