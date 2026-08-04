"use client";

/**
 * THE PERSISTENT "THIS IS A RECORDING" NOTICE.
 *
 * A deployed instance serves one negotiation that already happened. Someone
 * arriving at this URL sees a live-looking dashboard with a price ladder and a
 * settlement figure, and nothing else on the page would tell them that no
 * agents are running and that clicking a scenario will not start one.
 *
 * This is the same class of control as the SIMULATED banner and gets the same
 * treatment for the same reason:
 *
 *   - a full-width banner, not a corner badge, so it cannot be cropped out of a
 *     screenshot that still shows the numbers;
 *   - the meaning is carried by literal words, so it survives greyscale,
 *     screenshot compression, video re-encoding and colour blindness;
 *   - always rendered when the source is a snapshot, never conditional on
 *     anything a viewer or an operator could quietly turn off.
 *
 * The provenance is printed verbatim from the snapshot file rather than
 * summarised, because "recorded earlier" invites the question of when, under
 * what model, and whether the money was real, and the answers are the point.
 */

import type { SnapshotProvenance } from "@/lib/negotiation-source";

function formatTimestamp(iso: string): string {
  // Deliberately not localised: a fixed, unambiguous rendering is better here
  // than one that reads differently depending on who is looking.
  return iso.replace("T", " ").replace(/\.\d+Z$/, "Z");
}

export function RecordedRunBanner(props: { provenance: SnapshotProvenance }) {
  const { provenance } = props;

  return (
    <aside className="recorded-banner" role="note">
      <p className="recorded-banner-headline">
        Replaying a recorded run. No agents are running and nothing here is live.
      </p>

      <dl className="recorded-banner-facts">
        <div>
          <dt>run</dt>
          <dd className="mono">{provenance.runId}</dd>
        </div>
        <div>
          <dt>scenario</dt>
          <dd>
            {provenance.scenario}, {provenance.strategy}
          </dd>
        </div>
        <div>
          <dt>exported</dt>
          <dd className="mono">{formatTimestamp(provenance.exportedAt)}</dd>
        </div>
        <div>
          <dt>model</dt>
          <dd>
            {provenance.llmMode === "off"
              ? "none, deterministic rationales"
              : `${provenance.llmModel || provenance.llmMode}, ${provenance.llmCallCount} calls`}
          </dd>
        </div>
        <div>
          <dt>settlement</dt>
          <dd>
            {provenance.settlementIsStub
              ? `${provenance.settlementAdapter}, simulated, no real money moved`
              : `${provenance.settlementAdapter}, real, ${provenance.settlementTxHash ?? "no reference"}`}
          </dd>
        </div>
      </dl>
    </aside>
  );
}
