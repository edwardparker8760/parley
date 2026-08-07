/**
 * The controls a DEPLOYED dashboard gets: switch between the bundled
 * recordings.
 *
 * ## Why these are links and not buttons
 *
 * Choosing a recording is navigation, not an action. A link gives the run a URL
 * that can be shared, opened in a new tab, bookmarked in a submission, and
 * reached with JavaScript disabled. `next/link` still makes the switch a client
 * transition, so nothing is paid for that.
 *
 * Nothing here holds state either. Which run is showing is in the URL, and the
 * server has already resolved it, so this component only has to render what it
 * is handed.
 *
 * ## Why the outcome is on the button
 *
 * The three runs are only worth switching between because they end differently.
 * A row of buttons reading A, B, C asks the visitor to press all three to find
 * out what they do; a row that says "settled", "settled, guardrail fired 9x"
 * and "walked away" is the argument itself, readable without a single click.
 */

import Link from "next/link";
import type { RecordedRun } from "@/lib/negotiation-source";

/** What each scenario is, in the words the landing page uses for it. */
const SHAPE: Record<string, string> = {
  A: "limits overlap a lot",
  B: "limits barely overlap",
  C: "limits do not overlap",
};

function outcomeLabel(run: RecordedRun): string {
  if (run.status === "WALKED_AWAY") return "walked away, nothing paid";
  return run.strategy === "baseline" ? "settled, guardrail fired" : "settled, no clamp needed";
}

export function RecordedRunSwitcher(props: {
  runs: readonly RecordedRun[];
  activeId: string | null;
}) {
  return (
    <div className="launcher-bar">
      <div className="launchers">
        {props.runs.map((run) => (
          <Link
            key={run.id}
            href={`/app?negotiation=${encodeURIComponent(run.id)}`}
            scroll={false}
            className={run.id === props.activeId ? "launcher active" : "launcher"}
            aria-current={run.id === props.activeId ? "true" : undefined}
          >
            {/* "View", not "Start". This instance cannot start anything, and a
                verb it cannot honour is worse than a dull one: the visitor
                presses it, a recording appears, and they reasonably conclude
                the button did something it did not. */}
            <span className="launcher-name">
              View scenario {run.scenario}
              <span className="launcher-shape"> {SHAPE[run.scenario] ?? ""}</span>
            </span>
            <span className="launcher-label">{outcomeLabel(run)}</span>
          </Link>
        ))}
      </div>

      {/* Says plainly what these controls do, so nobody presses one expecting
          to start a negotiation and concludes the button is broken. */}
      <p className="switcher-note">
        Three recorded runs, already finished. This instance replays them and
        cannot start a new negotiation. To run the agents live, clone the repo
        and start it with <code>PARLEY_DATA_SOURCE=sqlite</code>; see
        docs/how-to-run.md.
      </p>
    </div>
  );
}
