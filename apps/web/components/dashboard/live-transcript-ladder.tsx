"use client";

/**
 * The offer ladder: what each side said, and what arithmetic did about it.
 *
 * Every string here is rendered as React text. `rationale` in particular is
 * untrusted: phase 05 stores raw model output, and a counterparty can put
 * arbitrary text into a rationale that then reaches this table. React escapes
 * by default and `dangerouslySetInnerHTML` is banned repo-wide, with a test
 * that greps for it.
 *
 * The clamp badge is a headline demo element, not a debug affordance. It is the
 * moment the audience sees an owner's limit override a strategy, so it is sized
 * to be legible in a video frame rather than tucked into a tooltip.
 */

import { useEffect, useRef } from "react";
import type { TranscriptRowView } from "@parley/orchestrator";
import { unitPriceLabel } from "./format-micro-usdc";

export function LiveTranscriptLadder(props: {
  rows: readonly TranscriptRowView[];
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [props.rows.length]);

  return (
    <section className="panel panel-transcript">
      <h2>
        Transcript
        <span className="panel-note">every message both agents exchanged</span>
      </h2>

      <div className="ladder-scroll">
        <table className="ladder">
          <thead>
            <tr>
              <th>r</th>
              <th>party</th>
              <th>type</th>
              <th>price</th>
              <th>terms</th>
              <th>rationale</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => (
              <tr key={row.seq} className={`row-${row.party.toLowerCase()}`}>
                <td className="col-round">{row.round}</td>
                <td className="col-party">{row.party}</td>
                <td className="col-type">
                  {row.type}
                  {row.reasonCode === null ? null : (
                    <span className="reason-code">{row.reasonCode}</span>
                  )}
                </td>
                <td className="col-price">{unitPriceLabel(row.unitPriceMicroUsdc)}</td>
                <td className="col-terms">
                  {row.slaTier === null
                    ? ""
                    : `${row.slaTier}, ${row.deliveryWindowHours}h`}
                </td>
                <td className="col-rationale">
                  {row.rationale}
                  {row.clamps.map((clamp, index) => (
                    <span key={index} className="clamp-badge">
                      GUARDRAIL: {clamp.party} proposed {clamp.proposed}, forced to{" "}
                      {clamp.clamped} ({clamp.bound})
                    </span>
                  ))}
                  {row.llm !== null && row.llm.rejectedPriceMicroUsdc !== null ? (
                    <span className="llm-badge">
                      LLM asked {row.llm.rejectedPriceMicroUsdc}, sent{" "}
                      {row.llm.finalPriceMicroUsdc}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div ref={endRef} />
      </div>
    </section>
  );
}
