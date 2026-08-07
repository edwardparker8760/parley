"use client";

/**
 * The one screen. Composition only: every panel owns its own rendering.
 *
 * It renders identically whether the data came from a live SQLite run or from
 * a bundled recording, because both arrive as the same `NegotiationView`. The
 * only differences are what the header offers and what the banner says, and
 * both come from props rather than from a check inside a panel.
 *
 * ## The header always offers something
 *
 * A live instance gets the launchers, which start a negotiation. A deployed
 * instance gets the switcher, which moves between the recordings it bundles.
 * What it must never do is offer neither: an instance that can only replay is
 * still an instance a visitor should be able to operate.
 *
 * `?negotiation=<id>` renders a completed negotiation with no live process,
 * which is the switcher's mechanism, the replay feature, and the recovery path
 * if SSE misbehaves while the video is being shot.
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { NegotiationView } from "@parley/orchestrator";
import { useNegotiationEventStream } from "@/hooks/use-negotiation-event-stream";
import type { RecordedRun, SnapshotProvenance } from "@/lib/negotiation-source";
import { ScenarioLauncherButtons } from "@/components/dashboard/scenario-launcher-buttons";
import type { StrategyName } from "@/components/dashboard/scenario-launcher-buttons";
import { RecordedRunSwitcher } from "@/components/dashboard/recorded-run-switcher";
import { LiveTranscriptLadder } from "@/components/dashboard/live-transcript-ladder";
import { ConvergencePriceChart } from "@/components/dashboard/convergence-price-chart";
import { GuardrailLimitsPanel } from "@/components/dashboard/guardrail-limits-panel";
import { SettlementStatusPanel } from "@/components/dashboard/settlement-status-panel";
import { WalkawayPostmortemPanel } from "@/components/dashboard/walkaway-postmortem-panel";
import { RecordedRunBanner } from "@/components/dashboard/recorded-run-banner";
import { NegotiationBriefingStrip } from "@/components/dashboard/negotiation-briefing-strip";
import { ColdStartExplainer } from "@/components/dashboard/cold-start-explainer";

export function DashboardScreen(props: {
  readonly canRunLive: boolean;
  /** The recordings this instance can switch between. Empty when live. */
  readonly runs: readonly RecordedRun[];
  readonly provenance: SnapshotProvenance | null;
  /** Pre-rendered on the server, for a recording or for `?negotiation=`. */
  readonly initialView: NegotiationView | null;
  /** A server-side read that failed, most likely an id that is not bundled. */
  readonly initialError: string | null;
}) {
  const searchParams = useSearchParams();
  const replayId = searchParams.get("negotiation");
  const stream = useNegotiationEventStream(replayId, props.initialView);
  const [strategy, setStrategy] = useState<StrategyName>("engine");
  const view = stream.view;
  const showing = stream.negotiationId ?? replayId;
  const error = props.initialError ?? stream.error;

  return (
    <main className="screen">
      <header className="topbar">
        <div className="brand">
          <h1>Parley</h1>
          <p>
            Two agents negotiate. Their owners&apos; limits are arithmetic, not
            instructions, so neither agent can talk its way past them.
          </p>
        </div>

        {props.canRunLive ? (
          <ScenarioLauncherButtons
            running={stream.running}
            active={view?.scenario ?? null}
            strategy={strategy}
            onStrategyChange={setStrategy}
            onRun={(scenario) => void stream.start(scenario, strategy)}
          />
        ) : props.runs.length > 0 ? (
          <RecordedRunSwitcher runs={props.runs} activeId={showing} />
        ) : null}

        <div className="run-meta">
          {stream.negotiationId === null ? null : (
            <span className="mono">{stream.negotiationId}</span>
          )}
          {view === null ? null : (
            <span className={`outcome outcome-${view.status.toLowerCase()}`}>
              {view.status}
            </span>
          )}
        </div>
      </header>

      {/* The frame, above everything. A viewer who arrived here directly needs
          to know what is being traded and under whose limits BEFORE meeting a
          ladder of numbers, or the ladder is noise. */}
      {view === null ? null : <NegotiationBriefingStrip view={view} />}

      {/* Then whether any of it is live, whenever the data is a recording. */}
      {props.provenance === null ? null : (
        <RecordedRunBanner provenance={props.provenance} />
      )}

      {error !== null ? <p className="error-banner">{error}</p> : null}

      {view === null ? (
        /*
         * The cold screen. This used to be a single sentence, which meant the
         * only state a first-time visitor can arrive at was the one state that
         * explained nothing. The briefing strip above cannot help here: it
         * reads its figures off a run, and there is no run yet.
         */
        <ColdStartExplainer />
      ) : (
        <div className="grid">
          {/* Left column is an explicit stack rather than grid auto-placement:
              with five panels and four slots, the last two would land in an
              implicit row and be clipped by the screen's overflow rule. */}
          <div className="column-left">
            <ConvergencePriceChart view={view} />
            <GuardrailLimitsPanel guardrails={view.guardrails} />
            {view.postMortems.length > 0 ? (
              <WalkawayPostmortemPanel postMortems={view.postMortems} />
            ) : (
              <SettlementStatusPanel
                settlement={view.settlement}
                walkedAway={view.status === "WALKED_AWAY"}
              />
            )}
          </div>
          <LiveTranscriptLadder rows={view.messages} />
        </div>
      )}
    </main>
  );
}
