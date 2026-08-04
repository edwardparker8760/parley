"use client";

/**
 * Why nobody agreed.
 *
 * This panel carries scenario C, which is the demo that proves the guardrails
 * bind. Two sides, each naming the limit that stopped it, and one line that
 * answers the question the audience actually has: was a deal ever possible?
 *
 * `zopaExisted` comes from the observer oracle and is written AFTER the
 * negotiation ends, so it cannot have leaked to an agent mid-negotiation.
 */

import type { PostMortemView } from "@parley/orchestrator";
import { microToUsdc } from "./format-micro-usdc";

export function WalkawayPostmortemPanel(props: {
  postMortems: readonly PostMortemView[];
}) {
  if (props.postMortems.length === 0) return null;

  const everPossible = props.postMortems.some((entry) => entry.zopaExisted);

  return (
    <section className="panel panel-postmortem">
      <h2>
        Walk-away
        <span className="panel-note">no payment was made</span>
      </h2>

      <p className={everPossible ? "verdict possible" : "verdict impossible"}>
        {everPossible
          ? "A deal was possible, and the two sides did not find it in time."
          : "A deal was never possible: the two owners' limits do not overlap."}
      </p>

      <div className="postmortem-cards">
        {props.postMortems.map((entry) => (
          <article key={entry.party} className={`postmortem ${entry.party.toLowerCase()}`}>
            <h3>{entry.party}</h3>
            <p className="reason-code">{entry.reasonCode}</p>
            <p className="bound">bound by: {entry.boundName}</p>
            {entry.finalGapMicroUsdc === null ? null : (
              <p className="gap">
                final gap {microToUsdc(entry.finalGapMicroUsdc)}/call
              </p>
            )}
            <p className="rounds">after {entry.roundsUsed} rounds</p>
            <p className="explanation">{entry.explanation}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
