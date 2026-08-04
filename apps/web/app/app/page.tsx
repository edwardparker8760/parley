import { Suspense } from "react";
import { negotiationSource } from "@/lib/select-negotiation-source";
import { DashboardScreen } from "@/components/dashboard/dashboard-screen";

/**
 * The /app route: a server component that picks the data source, then hands the
 * screen everything it needs as props.
 *
 * Doing the selection here rather than inside the screen is what keeps a
 * snapshot deployment free of the database. `better-sqlite3` is only reachable
 * through the sqlite source, which is imported lazily, so it never enters the
 * bundle when the snapshot is selected.
 *
 * `force-dynamic` because the source is chosen from the environment at request
 * time. Prerendering this would bake whichever source happened to be selected
 * during the build into the output.
 */
export const dynamic = "force-dynamic";

export default function Page() {
  const source = negotiationSource();
  const defaultId = source.defaultNegotiationId();

  return (
    // useSearchParams inside needs a Suspense boundary in the App Router.
    <Suspense fallback={<main className="screen" />}>
      <DashboardScreen
        canRunLive={source.canRunLive}
        provenance={source.provenance}
        initialView={defaultId === null ? null : source.read(defaultId)}
      />
    </Suspense>
  );
}
