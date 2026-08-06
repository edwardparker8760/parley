"use client";

/**
 * THE FRAME. Everything below it is unreadable without it.
 *
 * A viewer who opens /app directly, having read nothing, previously met a price
 * ladder, two dashed lines and a clamp code, with no statement anywhere of what
 * was being bought, by whom, under what limits, or how it ended. Every number
 * on the screen was unanchored. This strip is the missing sentence.
 *
 * It adds no data. Every figure here is already rendered somewhere below, in a
 * panel that assumes you know what it is looking at.
 *
 * ## Why the two limits are the shape of it
 *
 * The whole story is offers moving between two fixed numbers. So the strip is
 * literally that shape: the buyer's ceiling on one side, the seller's floor on
 * the other, and the sentence about whether they overlap between them. Read
 * only this and you know what the run was trying to do and whether it could
 * possibly have worked.
 *
 * ## Why the verdict sits inside it
 *
 * Setup and outcome belong together at the top: the two questions a stranger
 * has are "what is this" and "what happened", and answering the first without
 * the second sends them hunting through four panels for the ending.
 */

import type { NegotiationView } from "@parley/orchestrator";
import { briefingFor, verdictFor } from "@/lib/describe-negotiation";

export function NegotiationBriefingStrip(props: { view: NegotiationView }) {
  const briefing = briefingFor(props.view);
  const verdict = verdictFor(props.view);
  const walkedAway = props.view.status === "WALKED_AWAY";

  return (
    <section className="briefing" aria-label="What this negotiation is">
      <p className="briefing-lead">
        Two software agents are negotiating the price of{" "}
        <strong>{briefing.goods}</strong>, {briefing.terms}. Each agent acts for an
        owner who set its limits in advance. Neither agent can see the other&apos;s
        limit, and neither can be talked past its own.
      </p>

      {/* Buyer, the gap between them, seller. The layout is the story: two
          fixed limits with the room for a deal sitting between them. */}
      <div className="briefing-limits">
        <div className="briefing-side buyer">
          <h3>Buyer&apos;s owner said</h3>
          <p className="briefing-figure">
            <strong>{briefing.buyerCeilingMicro}</strong> per call, at most
          </p>
          <p className="briefing-detail">
            and no more than {briefing.buyerBudgetUsdc} USDC in total
          </p>
        </div>

        <p className="briefing-situation">{briefing.situation}</p>

        <div className="briefing-side seller">
          <h3>Seller&apos;s owner said</h3>
          <p className="briefing-figure">
            <strong>{briefing.sellerFloorMicro}</strong> per call, at least
          </p>
          <p className="briefing-detail">
            derived from a cost of {briefing.sellerCostBasisMicro} plus a{" "}
            {briefing.sellerMarginPct}% margin floor
          </p>
        </div>
      </div>

      {/* The one line a viewer in a hurry should read. Marked as the outcome
          rather than styled as prose, because it is the answer. */}
      <p className={walkedAway ? "briefing-verdict walked" : "briefing-verdict settled"}>
        <span className="briefing-verdict-tag">Outcome</span>
        {verdict}
      </p>

      <p className="briefing-units">
        Per-call prices are micro-USDC, millionths of a dollar, the whole numbers
        the ledger stores. Totals are USDC.
      </p>
    </section>
  );
}
