/**
 * A real ladder excerpt, as markup, beside the hero headline.
 *
 * ## The numbers are transcribed from a real run, not invented
 *
 * Rounds 3 to 5 of `b-baseline-mse6fg7h`: scenario B, the phase 02 baseline
 * agent, recorded 2026-08-04. The two clamp lines are the actual events the
 * ledger holds, 910 forced to 900 and 954 forced to 900 against the buyer's
 * MAX_UNIT_PRICE of 900.
 *
 * Inventing a plausible-looking ladder here would have been easier and would
 * have looked identical to a visitor, which is exactly why it is not done. This
 * page's whole argument is that the project does not fabricate evidence, and a
 * fabricated hero would be the first thing to contradict it.
 *
 * ## Colour
 *
 * Party identity and the stopped class come from `@parley/theme`, the same
 * tokens the product uses. The clamp line is the inline left bar, which is the
 * shape reserved for "a guardrail fired", never for a failure.
 */

import type { CSSProperties } from "react";

interface Row {
  readonly round: number;
  readonly party: "BUYER" | "SELLER";
  readonly price: string;
  readonly clamp: { bound: string; from: string; to: string } | null;
}

const ROWS: readonly Row[] = [
  { round: 3, party: "BUYER", price: "828", clamp: null },
  { round: 3, party: "SELLER", price: "1238", clamp: null },
  {
    round: 4,
    party: "BUYER",
    price: "900",
    clamp: { bound: "MAX_UNIT_PRICE", from: "910", to: "900" },
  },
  { round: 4, party: "SELLER", price: "1171", clamp: null },
  {
    round: 5,
    party: "BUYER",
    price: "900",
    clamp: { bound: "MAX_UNIT_PRICE", from: "954", to: "900" },
  },
  { round: 5, party: "SELLER", price: "1117", clamp: null },
];

export function TranscriptExcerpt() {
  return (
    <figure className="excerpt">
      <figcaption className="excerpt-head">
        <span className="excerpt-title">live ladder</span>
        <span className="excerpt-run mono">b-baseline, scenario B, rounds 3 to 5</span>
      </figcaption>

      <div className="excerpt-body mono">
        {ROWS.map((row, index) => (
          /*
           * The row index drives the entrance cascade, so the ladder types
           * itself in the order it actually happened rather than appearing as a
           * finished block. The stagger is what makes it read as a recording.
           */
          <div
            key={index}
            className="excerpt-line"
            style={{ "--row-index": index } as CSSProperties}
          >
            <span className="excerpt-round">r{row.round}</span>
            <span className={`excerpt-party ${row.party.toLowerCase()}`}>{row.party}</span>
            <span className="excerpt-price">{row.price}</span>
            {row.clamp === null ? null : (
              <span className="excerpt-clamp">
                &gt;&gt; CLAMP {row.party} {row.clamp.bound} unitPrice: {row.clamp.from} -&gt;{" "}
                {row.clamp.to}
              </span>
            )}
          </div>
        ))}
      </div>

      <p className="excerpt-foot">
        The buyer&apos;s owner set 900. The agent asked for 954. Arithmetic sent 900.
      </p>
    </figure>
  );
}
