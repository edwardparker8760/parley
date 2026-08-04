"use client";

/**
 * The one screen. Composition only: every panel owns its own rendering.
 *
 * `?negotiation=<id>` renders a completed negotiation from the ledger with no
 * live process, which is both the replay feature and the recovery path if SSE
 * misbehaves while the video is being shot.
 */

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useNegotiationEventStream } from "@/hooks/use-negotiation-event-stream";
import { ScenarioLauncherButtons } from "@/components/scenario-launcher-buttons";
import type { StrategyName } from "@/components/scenario-launcher-buttons";
import { LiveTranscriptLadder } from "@/components/live-transcript-ladder";
import { ConvergencePriceChart } from "@/components/convergence-price-chart";
import { GuardrailLimitsPanel } from "@/components/guardrail-limits-panel";
import { SettlementStatusPanel } from "@/components/settlement-status-panel";
import { WalkawayPostmortemPanel } from "@/components/walkaway-postmortem-panel";

function Dashboard() {
  const searchParams = useSearchParams();
  const replayId = searchParams.get("negotiation");
  const stream = useNegotiationEventStream(replayId);
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

        <ScenarioLauncherButtons
          running={stream.running}
          active={view?.scenario ?? null}
          strategy={strategy}
          onStrategyChange={setStrategy}
          onRun={(scenario) => void stream.start(scenario, strategy)}
        />

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

export default function Page() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<main className="screen" />}>
      <Dashboard />
    </Suspense>
  );
}
