/**
 * The development data source: the real SQLite ledger, unchanged.
 *
 * This is the path that records the snapshot, so it must stay the authoritative
 * one. Everything the deployed page shows was produced here first.
 *
 * It needs a filesystem and a native module, which is exactly why it is not the
 * default: selecting it has to be a deliberate act.
 */

import { buildNegotiationView } from "@parley/orchestrator";
import type { NegotiationView } from "@parley/orchestrator";
import { sharedLedger } from "./negotiation-run-registry";
import type { NegotiationSource } from "./negotiation-source";

export function createSqliteSource(): NegotiationSource {
  return {
    kind: "sqlite",
    canRunLive: true,

    listRuns() {
      // Empty on purpose. This source can start a real negotiation, so its
      // controls are the launchers; the ledger's accumulated history is a
      // development artifact and not something to page through on screen.
      return [];
    },

    provenanceFor() {
      // Nothing here is a recording, so nothing here needs a banner saying so.
      return null;
    },

    defaultNegotiationId() {
      // Nothing to show until someone runs a scenario. The page renders its
      // empty state, which invites exactly that.
      return null;
    },

    read(negotiationId: string): NegotiationView {
      return buildNegotiationView(sharedLedger(), negotiationId);
    },
  };
}
