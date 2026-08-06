/**
 * The deployed data source: three recorded negotiations, bundled at build time.
 *
 * `import` rather than `readFileSync`, deliberately. A bundled import becomes
 * part of the JavaScript output, so this works on a serverless function, a
 * static host, or an edge runtime with no filesystem at all. Reading the files
 * at runtime would reintroduce exactly the deployment dependency the snapshot
 * exists to remove.
 *
 * ## Why three and not one
 *
 * One recording made the deployed dashboard a poster: there was exactly one
 * thing to look at, so there was nothing to press, so the controls were hidden
 * and a visitor could do nothing at all. Three recordings make the same page a
 * real instrument, because the three outcomes ARE the argument:
 *
 *   A  engine, wide overlap   settles, and the guardrail never fires: the good
 *                             agent did not need the limit
 *   B  baseline, narrow       settles, and the guardrail fires nine times: the
 *                             blunt agent did need it, and got it
 *   C  engine, no overlap     both sides walk away and nothing is paid
 *
 * Nobody can start a run on a deployment, but everybody can now see all three
 * things the project claims.
 *
 * The files are GENERATED, never hand-written:
 *
 *   pnpm --filter @parley/orchestrator export-snapshot <negotiationId> \
 *     --db <file> --out apps/web/data/negotiation-snapshot-<letter>.json
 *
 * Hand-editing one would produce a page showing numbers that no run ever
 * produced, which is the same integrity failure as a fabricated latency report.
 */

import snapshotA from "@/data/negotiation-snapshot-a.json";
import snapshotB from "@/data/negotiation-snapshot-b.json";
import snapshotC from "@/data/negotiation-snapshot-c.json";
import type { NegotiationView } from "@parley/orchestrator";
import type {
  NegotiationSnapshot,
  NegotiationSource,
  RecordedRun,
} from "./negotiation-source";

/*
 * Scenario order, not export order. A visitor reading the buttons left to right
 * should meet the wide overlap before the narrow one and the impossible one
 * last, because that is the order in which the three make sense.
 */
const BUNDLED: readonly NegotiationSnapshot[] = [
  snapshotA as unknown as NegotiationSnapshot,
  snapshotB as unknown as NegotiationSnapshot,
  snapshotC as unknown as NegotiationSnapshot,
];

const BY_ID = new Map(BUNDLED.map((snapshot) => [snapshot.view.negotiationId, snapshot]));

const RUNS: readonly RecordedRun[] = BUNDLED.map((snapshot) => ({
  id: snapshot.view.negotiationId,
  scenario: snapshot.provenance.scenario,
  strategy: snapshot.provenance.strategy,
  status: snapshot.view.status,
}));

export function createSnapshotSource(): NegotiationSource {
  return {
    kind: "snapshot",
    canRunLive: false,

    listRuns() {
      return RUNS;
    },

    provenanceFor(negotiationId: string) {
      return BY_ID.get(negotiationId)?.provenance ?? null;
    },

    defaultNegotiationId() {
      // Scenario A: the one where the agents agree. A visitor who presses
      // nothing should still see a negotiation that worked.
      return BUNDLED[0]!.view.negotiationId;
    },

    read(negotiationId: string): NegotiationView {
      const found = BY_ID.get(negotiationId);
      // Asking for a run that is not bundled is a caller bug, and the honest
      // answer is to say so rather than to serve one run under another's name.
      if (found === undefined) {
        throw new Error(
          `This deployment bundles ${BUNDLED.length} recorded negotiations ` +
            `(${[...BY_ID.keys()].join(", ")}). No run named "${negotiationId}" ` +
            `is available here. Run locally against the SQLite ledger to browse ` +
            `other negotiations.`,
        );
      }
      return found.view;
    },
  };
}
