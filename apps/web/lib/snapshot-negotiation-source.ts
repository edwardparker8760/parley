/**
 * The deployed data source: one recorded negotiation, bundled at build time.
 *
 * `import` rather than `readFileSync`, deliberately. A bundled import becomes
 * part of the JavaScript output, so this works on a serverless function, a
 * static host, or an edge runtime with no filesystem at all. Reading the file
 * at runtime would reintroduce exactly the deployment dependency the snapshot
 * exists to remove.
 *
 * The file is GENERATED, never hand-written:
 *
 *   pnpm --filter @parley/orchestrator export-snapshot <negotiationId> --db <file>
 *
 * Hand-editing it would produce a page showing numbers that no run ever
 * produced, which is the same integrity failure as a fabricated latency report.
 */

import snapshot from "@/data/negotiation-snapshot.json";
import type { NegotiationView } from "@parley/orchestrator";
import type { NegotiationSnapshot, NegotiationSource } from "./negotiation-source";

const loaded = snapshot as unknown as NegotiationSnapshot;

export function createSnapshotSource(): NegotiationSource {
  return {
    kind: "snapshot",
    canRunLive: false,
    provenance: loaded.provenance,

    defaultNegotiationId() {
      return loaded.view.negotiationId;
    },

    read(negotiationId: string): NegotiationView {
      // One run is bundled. Asking for a different id is a caller bug, and the
      // honest answer is to say so rather than to serve the one run under a
      // name that is not its own.
      if (negotiationId !== loaded.view.negotiationId) {
        throw new Error(
          `This deployment bundles a single recorded negotiation, ` +
            `"${loaded.view.negotiationId}". No run named "${negotiationId}" ` +
            `is available here. Run locally against the SQLite ledger to browse ` +
            `other negotiations.`,
        );
      }
      return loaded.view;
    },
  };
}
