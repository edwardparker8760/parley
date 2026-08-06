import { Suspense } from "react";
import { negotiationSource } from "@/lib/select-negotiation-source";
import { DashboardScreen } from "@/components/dashboard/dashboard-screen";
import type { NegotiationView } from "@parley/orchestrator";

/**
 * The /app route: a server component that picks the data source, resolves which
 * negotiation was asked for, then hands the screen everything it needs.
 *
 * Doing the selection here rather than inside the screen is what keeps a
 * snapshot deployment free of the database. `better-sqlite3` is only reachable
 * through the sqlite source, which is imported lazily, so it never enters the
 * bundle when the snapshot is selected.
 *
 * ## Why `?negotiation=` is resolved on the server
 *
 * Switching between the bundled recordings is ordinary navigation: the link
 * changes the query, this component reads it, and the whole view arrives
 * already rendered. No client fetch, no loading state, and it works on the
 * first paint. The alternative, fetching in the browser after mount, would put
 * a spinner in front of data that is already in the bundle.
 *
 * `force-dynamic` because the source is chosen from the environment at request
 * time. Prerendering this would bake whichever source happened to be selected
 * during the build into the output.
 */
export const dynamic = "force-dynamic";

export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const source = negotiationSource();
  const params = await props.searchParams;

  const asked = params["negotiation"];
  const requested = typeof asked === "string" ? asked : null;
  const id = requested ?? source.defaultNegotiationId();

  /*
   * An unknown id is the visitor's mistake, not a reason to show a stack trace.
   * The screen renders its error banner and the switcher stays usable, so the
   * way out is one click away.
   */
  let view: NegotiationView | null = null;
  let error: string | null = null;
  if (id !== null) {
    try {
      view = source.read(id);
    } catch (cause: unknown) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  return (
    // useSearchParams inside needs a Suspense boundary in the App Router.
    <Suspense fallback={<main className="screen" />}>
      <DashboardScreen
        /*
         * Remount when the displayed run changes. The screen seeds its stream
         * state from `initialView`, and seeded state does not follow a prop, so
         * without this a switch would change the URL and leave the old ladder
         * on screen.
         */
        key={id ?? "empty"}
        canRunLive={source.canRunLive}
        runs={source.listRuns()}
        provenance={id === null ? null : source.provenanceFor(id)}
        initialView={view}
        initialError={error}
      />
    </Suspense>
  );
}
