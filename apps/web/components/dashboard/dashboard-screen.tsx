"use client";

/**
 * The one screen. Composition only: every panel owns its own rendering.
 *
 * It renders identically whether the data came from a live SQLite run or from
 * the bundled snapshot, because both arrive as the same `NegotiationView`. The
 * only differences are what the header offers and what the banner says, and
 * both come from props rather than from a check inside a panel.
 *
 * `?negotiation=<id>` renders a completed negotiation from the ledger with no
 * live process, which is both the replay feature and the recovery path if SSE
 * misbehaves while the video is being shot.
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { NegotiationView } from "@parley/orchestrator";
import { useNegotiationEventStream } from "@/hooks/use-negotiation-event-stream";
import type { SnapshotProvenance } from "@/lib/negotiation-source";
import { ScenarioLauncherButtons } from "@/components/dashboard/scenario-launcher-buttons";
import type { StrategyName } from "@/components/dashboard/scenario-launcher-buttons";
import { LiveTranscriptLadder } from "@/components/dashboard/live-transcript-ladder";
import { ConvergencePriceChart } from "@/components/dashboard/convergence-price-chart";
import { GuardrailLimitsPanel } from "@/components/dashboard/guardrail-limits-panel";
import { SettlementStatusPanel } from "@/components/dashboard/settlement-status-panel";
import { WalkawayPostmortemPanel } from "@/components/dashboard/walkaway-postmortem-panel";
import { RecordedRunBanner } from "@/components/dashboard/recorded-run-banner";

export function DashboardScreen(props: {
  readonly canRunLive: boolean;
  readonly provenance: SnapshotProvenance | null;
  /** Pre-rendered on the server for a snapshot deployment. */
  readonly initialView: NegotiationView | null;
}) {
  const searchParams = useSearchParams();
  const replayId = props.canRunLive ? searchParams.get("negotiation") : null;
  const stream = useNegotiationEventStream(replayId, props.initialView);
  const [strategy, setStrategy] = useState<StrategyName>("engine");
  const view = stream.view;

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

      {/* Above everything, always, whenever the data is a recording. */}
      {props.provenance === null ? null : (
        <RecordedRunBanner provenance={props.provenance} />
      )}

      {stream.error !== null ? (
        <p className="error-banner">{stream.error}</p>
      ) : null}

      {view === null ? (
        <p className="empty-state">
          Pick a scenario. A is a wide overlap, B is narrow, C has none at all
          and must end with both sides walking away.
        </p>
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
