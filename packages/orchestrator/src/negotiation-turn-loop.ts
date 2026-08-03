/**
 * The turn loop. Owns alternation, sequencing, the round cap, and termination.
 *
 * THE ROUND CAP LIVES HERE, OUTSIDE BOTH AGENTS. That is the point: an agent
 * cannot extend the conversation, because the thing that decides whether the
 * conversation continues is not the thing that wants a better price. A hostile
 * agent that never accepts and never walks away still terminates, because the
 * loop synthesises the walk-away on its behalf.
 *
 * `round` counts full buyer-plus-seller exchanges, so a cap of 12 means at
 * most 24 messages. `seq` counts individual messages and is strictly
 * increasing within a negotiation.
 */

import { InProcessMessageBus, isTerminal } from "@parley/protocol";
import type { Envelope, EnvelopeParty } from "@parley/protocol";
import type { Agent } from "@parley/agents";
import type { MessageRepository, NegotiationRepository } from "@parley/ledger";

export interface TurnLoopOptions {
  readonly negotiationId: string;
  readonly scenario: string;
  readonly roundCap: number;
  readonly buyer: Agent;
  readonly seller: Agent;
  readonly bus: InProcessMessageBus;
  readonly negotiations: NegotiationRepository;
  readonly messages: MessageRepository;
  /** Injected so transcripts are reproducible. */
  readonly now: () => Date;
}

export interface TurnLoopResult {
  readonly negotiationId: string;
  readonly transcript: readonly Envelope[];
  readonly outcome: "SETTLED" | "WALKED_AWAY";
  readonly terminalMessage: Envelope;
}

export async function runNegotiation(
  options: TurnLoopOptions,
): Promise<TurnLoopResult> {
  const { negotiationId, roundCap, bus, messages, negotiations, now } = options;

  negotiations.create({
    id: negotiationId,
    scenario: options.scenario,
    roundCap,
    startedAt: now().toISOString(),
  });

  const transcript: Envelope[] = [];
  const agentByParty: Record<EnvelopeParty, Agent> = {
    BUYER: options.buyer,
    SELLER: options.seller,
  };

  // Every outbound message goes through `bus.publish` before it is recorded or
  // handed to the counterparty. That makes the bus the single egress point,
  // which is where phase 03 installs the guardrail band guard: a message that
  // never crosses the bus never reaches the other side.
  let seq = 0;
  let onTurn: EnvelopeParty = "BUYER";
  let inbound: Envelope | undefined;
  let terminal: Envelope | undefined;

  for (let round = 1; round <= roundCap && terminal === undefined; round += 1) {
    // One round is one message from each side, unless someone terminates.
    for (const _half of [0, 1]) {
      const agent = agentByParty[onTurn];
      const { outbound, decisionState } = await agent.decide({
        negotiationId,
        inbound,
        history: transcript,
        roundsRemaining: roundCap - round,
        round,
        seq,
        now,
      });

      await bus.publish(outbound);
      messages.append(outbound, decisionState);
      transcript.push(outbound);

      seq += 1;
      inbound = outbound;

      if (isTerminal(outbound)) {
        terminal = outbound;
        break;
      }
      onTurn = onTurn === "BUYER" ? "SELLER" : "BUYER";
    }
  }

  // Cap reached with nobody terminating: the loop ends it, attributed to
  // whichever side was next to speak.
  if (terminal === undefined) {
    const synthesised: Envelope = {
      negotiationId,
      round: roundCap,
      seq,
      from: onTurn,
      type: "WALK_AWAY",
      reasonCode: "ROUND_CAP_REACHED",
      rationale:
        `No agreement after ${roundCap} rounds. Walking away rather than ` +
        `negotiating indefinitely.`,
      createdAt: now().toISOString(),
    };
    await bus.publish(synthesised);
    messages.append(synthesised, { synthesisedBy: "turn-loop" });
    transcript.push(synthesised);
    terminal = synthesised;
  }

  const outcome = terminal.type === "ACCEPT" ? "SETTLED" : "WALKED_AWAY";
  negotiations.complete({
    id: negotiationId,
    outcome,
    endedAt: now().toISOString(),
  });

  return { negotiationId, transcript, outcome, terminalMessage: terminal };
}
