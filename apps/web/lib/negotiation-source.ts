/**
 * THE BOUNDARY THAT DECIDES WHETHER THIS DEPLOYS.
 *
 * The dashboard reads negotiations through this interface and never touches a
 * database directly. Two implementations exist:
 *
 *   sqlite    the real ledger. Live runs, live settlement, live LLM. This is
 *             development, and it is what records the snapshot.
 *   snapshot  a JSON file bundled at build time. No database, no filesystem,
 *             no API key, no network. This is what a deployed instance serves.
 *
 * ## Snapshot is the default, deliberately
 *
 * `PARLEY_DATA_SOURCE` selects, and an unset or unrecognised value means
 * snapshot. A fresh deploy with no configuration therefore cannot try to open a
 * database that is not there: the failure mode of forgetting to set the
 * variable is a working replay, not a crash. Choosing the live path has to be
 * deliberate, which is the right way round for the option that needs a disk.
 *
 * ## Two different questions, deliberately separated
 *
 * `canRunLive` asks whether this instance can START a negotiation. `listRuns()`
 * asks what it can SHOW. They used to be the same question, and treating them
 * as one is what made the deployed dashboard inert: a snapshot instance cannot
 * run anything, so the controls were hidden, so a visitor arrived at a screen
 * with nothing to press.
 *
 * A snapshot instance can still offer a real choice between the recordings it
 * bundles. It must not offer a button that quietly does nothing, which is a
 * different rule from "it must offer no buttons".
 */

import type { NegotiationView } from "@parley/orchestrator";

/**
 * Where the data on screen came from. Rendered literally in the deployed
 * banner, so every field here is something a viewer is entitled to know before
 * believing anything else on the page.
 */
export interface SnapshotProvenance {
  /** The negotiation id in the ledger this was exported from. */
  readonly runId: string;
  readonly scenario: string;
  readonly strategy: string;
  /**
   * The transcript's own clock, which is INJECTED and fixed so that two runs
   * of a scenario produce byte-identical ladders. It is not wall time and must
   * not be labelled as when this happened. `exportedAt` is the real timestamp.
   */
  readonly transcriptClockStartedAt: string;
  readonly exportedAt: string;
  /** `off` means every rationale is the deterministic template. */
  readonly llmMode: string;
  /** Empty when the run was deterministic. */
  readonly llmModel: string;
  readonly llmCallCount: number;
  /** `local-stub` or `arc-x402`. */
  readonly settlementAdapter: string;
  /** True when no real money moved. Mirrors the receipt column. */
  readonly settlementIsStub: boolean;
  /** Present only when a real chain reference exists. */
  readonly settlementTxHash: string | null;
  /** The command that produced the file, so it can be regenerated. */
  readonly generatedBy: string;
}

export interface NegotiationSnapshot {
  readonly provenance: SnapshotProvenance;
  readonly view: NegotiationView;
}

/**
 * One recorded run this instance can display, reduced to what the switcher
 * needs to label a button. The outcome is included because it is the whole
 * reason to offer the choice: a visitor is picking between "they agreed" and
 * "they could not", not between three identical-looking runs.
 */
export interface RecordedRun {
  readonly id: string;
  readonly scenario: string;
  readonly strategy: string;
  readonly status: string;
}

export interface NegotiationSource {
  readonly kind: "sqlite" | "snapshot";
  /**
   * False for the snapshot source: it can show a negotiation but never start
   * one. The page reads this to decide whether to offer the LAUNCHERS, not
   * whether to offer controls at all.
   */
  readonly canRunLive: boolean;
  /**
   * Every recording bundled with this instance, in the order they should be
   * offered. Empty for the sqlite source, whose runs are made on demand and
   * whose history is not something the switcher should page through.
   */
  listRuns(): readonly RecordedRun[];
  /**
   * Where a given run's data came from. Null when the run is live, because a
   * live run needs no provenance banner: nothing about it is a recording.
   */
  provenanceFor(negotiationId: string): SnapshotProvenance | null;
  /** The negotiation to display when none is named in the URL. */
  defaultNegotiationId(): string | null;
  read(negotiationId: string): NegotiationView;
}
