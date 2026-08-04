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
 * ## Why the interface says whether it can run
 *
 * A snapshot source cannot start a negotiation, and the UI must not offer a
 * button that quietly does nothing. `canRunLive` is read by the page, which
 * disables the launchers and says why, rather than failing on click.
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

export interface NegotiationSource {
  readonly kind: "sqlite" | "snapshot";
  /**
   * False for the snapshot source. The page reads this to decide whether to
   * offer the scenario launchers at all.
   */
  readonly canRunLive: boolean;
  /**
   * Present only for the snapshot source. When set, the dashboard shows a
   * persistent banner rendering it literally.
   */
  readonly provenance: SnapshotProvenance | null;
  /** The negotiation to display when none is named in the URL. */
  defaultNegotiationId(): string | null;
  read(negotiationId: string): NegotiationView;
}
