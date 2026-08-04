"use client";

/**
 * What was paid, or was not.
 *
 * Three things this panel refuses to do:
 *
 *   1. Show a settlement when none happened. A walk-away renders the empty
 *      state, and the empty state says no payment was made rather than showing
 *      an ambiguous blank.
 *   2. Hide the SIMULATED badge. It comes from the persisted `isStub` column.
 *   3. Render an explorer link for a stub reference. A `0xstub-` string in an
 *      anchor tag looks exactly like a real transaction until someone clicks.
 */

import type { SettlementView } from "@parley/orchestrator";
import { microToUsdc, truncateHash } from "./format-micro-usdc";
import { SimulatedSettlementBadge } from "./simulated-settlement-badge";

export function SettlementStatusPanel(props: {
  settlement: SettlementView | null;
  walkedAway: boolean;
}) {
  if (props.settlement === null) {
    return (
      <section className="panel panel-settlement">
        <h2>Settlement</h2>
        <p className="settlement-empty">
          {props.walkedAway
            ? "No deal, so no payment. The settlement adapter was never called."
            : "Waiting for a deal."}
        </p>
      </section>
    );
  }

  const settlement = props.settlement;
  const showExplorer = !settlement.isStub && settlement.explorerUrl !== null;

  return (
    <section className="panel panel-settlement">
      <h2>
        Settlement
        {settlement.isStub ? <SimulatedSettlementBadge /> : null}
      </h2>

      <dl className="settlement-fields">
        <dt>status</dt>
        <dd className={`status status-${settlement.status.toLowerCase()}`}>
          {settlement.status}
        </dd>
        <dt>amount</dt>
        <dd className="amount">{microToUsdc(settlement.amountMicroUsdc)} USDC</dd>
        <dt>adapter</dt>
        <dd>{settlement.adapter}</dd>
        <dt>terms hash</dt>
        <dd className="mono">{truncateHash(settlement.termsHash)}</dd>
        <dt>reference</dt>
        <dd className="mono">
          {settlement.reference === null
            ? "none"
            : truncateHash(settlement.reference)}
        </dd>
        {settlement.latencyMs === null ? null : (
          <>
            <dt>latency</dt>
            <dd>{settlement.latencyMs}ms</dd>
          </>
        )}
        {settlement.error === null ? null : (
          <>
            <dt>error</dt>
            <dd className="error">{settlement.error}</dd>
          </>
        )}
      </dl>

      {showExplorer && settlement.explorerUrl !== null ? (
        <a
          className="explorer-link"
          href={settlement.explorerUrl}
          target="_blank"
          rel="noreferrer"
        >
          view on arcscan
        </a>
      ) : null}
    </section>
  );
}
