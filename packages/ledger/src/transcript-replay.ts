/**
 * Renders a negotiation ladder, and replays one from SQLite alone.
 *
 * The renderer is shared by the live run and the replay on purpose. Success
 * criterion 3 is that `pnpm replay <id>` output is byte-identical to the live
 * run, and the only honest way to guarantee that is for both paths to call the
 * same function over the same data.
 */

import { formatMicroAsUsdc } from "@parley/shared";
import type { Envelope } from "@parley/protocol";
import { ClampEventRepository } from "./clamp-event-repository.js";
import type { ClampEventRow } from "./clamp-event-repository.js";
import { MessageRepository } from "./message-repository.js";
import { NegotiationRepository } from "./negotiation-repository.js";
import type { Database } from "./sqlite-connection.js";

/** One ladder line. Fixed-width columns so the two price lines are readable. */
function renderRow(envelope: Envelope): string {
  const seq = String(envelope.seq).padStart(3, " ");
  const round = String(envelope.round).padStart(2, " ");
  const party = envelope.from.padEnd(6, " ");
  const type = envelope.type.padEnd(12, " ");

  let detail: string;
  if (envelope.type === "OFFER" || envelope.type === "COUNTEROFFER") {
    const unit = formatMicroAsUsdc(envelope.offer.unitPriceMicroUsdc);
    const total = formatMicroAsUsdc(
      envelope.offer.unitPriceMicroUsdc * BigInt(envelope.offer.quantity),
    );
    detail =
      `${unit}/call x ${envelope.offer.quantity} = ${total} USDC  ` +
      `[${envelope.offer.terms.slaTier}, ${envelope.offer.terms.deliveryWindowHours}h]`;
  } else if (envelope.type === "ACCEPT") {
    detail = `accepts seq ${envelope.acceptsSeq}`;
  } else {
    detail = envelope.reasonCode;
  }

  return `${seq} r${round} ${party} ${type} ${detail.padEnd(52, " ")} ${envelope.rationale}`;
}

/**
 * Render a clamp event as a transcript line.
 *
 * Indented and marked so it reads as the SYSTEM overriding a party, not as
 * something the party said. This is the line that makes the safety claim
 * visible during the demo.
 */
function renderClampRow(event: ClampEventRow): string {
  const marker = event.severity === "BREACH" ? "!! BREACH" : ">> CLAMP ";
  return (
    `    ${marker} ${event.party.padEnd(6, " ")} ${event.bound.padEnd(26, " ")} ` +
    `${event.field}: ${event.proposed} -> ${event.clamped}  ${event.explanation}`
  );
}

/**
 * Full ladder as text. Used identically by the live run and by replay.
 *
 * Clamp events are interleaved directly after the message whose `seq` they
 * belong to, so the reader sees the proposal and the override adjacent rather
 * than having to correlate two separate views.
 */
export function renderLadder(
  envelopes: readonly Envelope[],
  header: { negotiationId: string; scenario: string; roundCap: number },
  clampEvents: readonly ClampEventRow[] = [],
): string {
  const clampsBySeq = new Map<number, ClampEventRow[]>();
  for (const event of clampEvents) {
    const existing = clampsBySeq.get(event.seq) ?? [];
    existing.push(event);
    clampsBySeq.set(event.seq, existing);
  }

  const body: string[] = [];
  for (const envelope of envelopes) {
    body.push(renderRow(envelope));
    for (const event of clampsBySeq.get(envelope.seq) ?? []) {
      body.push(renderClampRow(event));
    }
  }

  const lines = [
    `negotiation ${header.negotiationId}  scenario ${header.scenario}  cap ${header.roundCap} rounds`,
    "seq rnd party  type         detail                                               rationale",
    "".padEnd(110, "-"),
    ...body,
  ];

  const last = envelopes[envelopes.length - 1];
  if (last !== undefined) {
    lines.push("".padEnd(110, "-"));
    const clampCount = clampEvents.filter((e) => e.severity === "CLAMP").length;
    const breachCount = clampEvents.length - clampCount;
    lines.push(
      last.type === "ACCEPT"
        ? `OUTCOME: DEAL (${envelopes.length} messages)`
        : `OUTCOME: NO DEAL (${envelopes.length} messages)`,
    );
    lines.push(
      `GUARDRAILS: ${clampCount} clamp${clampCount === 1 ? "" : "s"} applied` +
        (breachCount > 0 ? `, ${breachCount} BREACH BLOCKED` : ""),
    );
  }
  return lines.join("\n");
}

/** Reconstruct and render a negotiation from the database only. */
export function replayNegotiation(
  db: Database,
  negotiationId: string,
): string {
  const negotiations = new NegotiationRepository(db);
  const negotiation = negotiations.findById(negotiationId);
  if (negotiation === undefined) {
    throw new Error(`No negotiation with id "${negotiationId}"`);
  }

  const envelopes = new MessageRepository(db).listByNegotiation(negotiationId);
  const clampEvents = new ClampEventRepository(db).listByNegotiation(
    negotiationId,
  );
  return renderLadder(
    envelopes,
    {
      negotiationId: negotiation.id,
      scenario: negotiation.scenario,
      roundCap: negotiation.roundCap,
    },
    clampEvents,
  );
}
