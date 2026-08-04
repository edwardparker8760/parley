/**
 * Picks the data source, once, from the environment.
 *
 * `PARLEY_DATA_SOURCE=sqlite` opts into the live ledger. Anything else,
 * including unset, gives the bundled snapshot.
 *
 * That default is the whole point. A deploy that forgets the variable gets a
 * working replay rather than a crash on a missing database, and the option that
 * needs a disk and a native module is the one you have to ask for.
 *
 * The sqlite module is imported lazily so that a snapshot deployment never
 * pulls `better-sqlite3` into its module graph at all.
 */

import type { NegotiationSource } from "./negotiation-source";
import { createSnapshotSource } from "./snapshot-negotiation-source";

const KEY = Symbol.for("parley.web.source");

export function negotiationSource(): NegotiationSource {
  const container = globalThis as unknown as Record<symbol, NegotiationSource | undefined>;
  const existing = container[KEY];
  if (existing !== undefined) return existing;

  const created =
    process.env["PARLEY_DATA_SOURCE"] === "sqlite"
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require("./sqlite-negotiation-source") as typeof import("./sqlite-negotiation-source")).createSqliteSource()
      : createSnapshotSource();

  container[KEY] = created;
  return created;
}

/** True when this instance can start a negotiation rather than replay one. */
export function canRunLive(): boolean {
  return negotiationSource().canRunLive;
}
