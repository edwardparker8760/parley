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

import { useEffect, useRef, useState } from "react";
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
import { CustomLimitsPanel } from "@/components/dashboard/custom-limits-panel";
import type { CustomLimitsInput } from "@/lib/custom-limits";

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
  /*
   * A custom run is held here, entirely beside the stream and the recordings.
   *
   * It deliberately does not go through `useNegotiationEventStream`: that hook
   * owns live SSE runs against a ledger, and a custom run is a single request
   * that returns a finished view. Reusing it would have meant teaching it about
   * a second transport for no gain, and risking the recordings path.
   */
  const [custom, setCustom] = useState<NegotiationView | null>(null);
  const [customProblems, setCustomProblems] = useState<readonly string[]>([]);
  const [customRunning, setCustomRunning] = useState(false);

  // The custom run wins when present, because pressing "Run with these limits"
  // is the most recent thing the visitor asked for.
  const view = custom ?? stream.view;
  const showing = stream.negotiationId ?? replayId;
  const error = props.initialError ?? stream.error;

  async function runCustom(
    limits: CustomLimitsInput,
    customStrategy: "engine" | "baseline",
  ): Promise<void> {
    setCustomRunning(true);
    setCustomProblems([]);
    try {
      const response = await fetch("/api/run-custom", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limits, strategy: customStrategy }),
      });
      const body = (await response.json()) as {
        view?: NegotiationView;
        problems?: string[];
      };
      if (!response.ok || body.view === undefined) {
        setCustomProblems(body.problems ?? ["The run could not be started."]);
        return;
      }
      setCustom(body.view);
    } catch {
      setCustomProblems([
        "Could not reach the server to run those limits. Check your connection and try again.",
      ]);
    } finally {
      setCustomRunning(false);
    }
  }

  /*
   * NEVER OPEN EMPTY.
   *
   * A replay instance already opens on scenario A: its source returns a default
   * negotiation id, so the server renders a complete run before any JavaScript
   * has an opinion. A LIVE instance had no equivalent, so the first thing a
   * visitor saw was an explanation floating above a large empty area, which
   * reads as broken even though nothing is wrong.
   *
   * So a live instance starts scenario A itself, once, on first paint. The
   * screen is then always showing a real negotiation, and the three buttons
   * become what they should have been from the start: a way to switch between
   * runs rather than the thing standing between you and seeing anything.
   *
   * The ref, not state, is what makes it once. React 18 mounts effects twice in
   * development strict mode, and a state flag would still be false on the
   * second invocation because the re-render has not committed yet, so this
   * would POST twice and start two negotiations.
   *
   * Skipped when `?negotiation=` is present: that URL is an explicit request
   * for one particular run, and auto-starting another would fight it.
   */
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    if (!props.canRunLive) return;
    if (replayId !== null) return;
    if (props.initialView !== null) return;

    autoStarted.current = true;
    void stream.start("A", "engine");
  }, [props.canRunLive, props.initialView, replayId, stream]);

  return (
    /*
     * The fixed screen, then the panel BELOW it.
     *
     * `.screen` is 100vh with `overflow: hidden`, deliberately: it is framed
     * for a 1920x1080 recording and a panel that pushes another one off the
     * bottom is the bug `layout-cannot-hide-a-panel.test.js` exists to catch.
     * So the limits panel is not inside it. It sits after it, in normal page
     * flow, and the page scrolls to reach it.
     *
     * That keeps the recorded frame exactly as it was while still giving the
     * feature somewhere to live.
     */
    <>
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
            // Null while a custom run is showing: none of the three scenarios
            // is what is on screen, and highlighting one would say otherwise.
            active={custom === null ? view?.scenario ?? null : null}
            strategy={strategy}
            onStrategyChange={setStrategy}
            onRun={(scenario) => {
              setCustom(null);
              void stream.start(scenario, strategy);
            }}
          />
        ) : props.runs.length > 0 ? (
          <RecordedRunSwitcher
            runs={props.runs}
            activeId={custom === null ? showing : null}
          />
        ) : null}

        <div className="run-meta">
          {/* The panel lives below the fixed screen, so without this nobody
              scrolls and the feature may as well not exist. */}
          <a className="jump-to-limits" href="#your-limits">
            Set your own limits &darr;
          </a>
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

      {/* A custom run must never be mistaken for one of the recordings, so it
          gets its own banner and the recording banner is suppressed: that one
          describes the bundled run, which is not what is on screen. */}
      {custom !== null ? (
        <div className="custom-run-banner">
          <strong>Your own limits, run just now.</strong> A fresh deterministic
          negotiation, computed on request from the numbers you set. It is not
          one of the three recordings and it was not replayed from anything. No
          model was consulted, so the same limits always produce the same run.
        </div>
      ) : props.provenance === null ? null : (
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
            ) : custom !== null ? (
              /*
               * A custom run agrees a price and stops. No settlement adapter is
               * passed, so none is attempted, and the panel says so rather than
               * rendering an empty settlement box that reads as a failure.
               */
              <section className="panel custom-settlement">
                <h2>Settlement</h2>
                <p className="custom-settlement-figure">
                  Agreed, but <strong>not settled</strong>.
                </p>
                <p className="custom-settlement-note">
                  Settlement is not attempted for limits you set yourself. This
                  run exists to show what the agents do inside your numbers; the
                  three recorded runs are where the payment path is shown.
                </p>
              </section>
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

      {/* Below the fold, deliberately. Read the run, then change the numbers
          behind it and run your own. */}
      <CustomLimitsPanel
        running={customRunning}
        problems={customProblems}
        onRun={(limits, customStrategy) => void runCustom(limits, customStrategy)}
      />
    </>
  );
}
