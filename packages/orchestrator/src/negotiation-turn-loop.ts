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
import { assertOutboundWithinBand } from "@parley/guardrails";
import type {
  BuyerGuardrails,
  SellerGuardrails,
} from "@parley/guardrails";
import type {
  ClampEventRepository,
  LlmInvocationRepository,
  MessageRepository,
  NegotiationRepository,
} from "@parley/ledger";

export interface TurnLoopOptions {
  readonly negotiationId: string;
  readonly scenario: string;
  readonly roundCap: number;
  readonly buyer: Agent;
  readonly seller: Agent;
  readonly bus: InProcessMessageBus;
  readonly negotiations: NegotiationRepository;
  readonly messages: MessageRepository;
  readonly clampEvents: ClampEventRepository;
  /**
   * Where LLM consultations are recorded. Absent when the run is deterministic,
   * which is every test run and every `LLM_MODE=off` demo.
   */
  readonly llmInvocations?: LlmInvocationRepository;
  /**
   * Each side's own guardrails, used ONLY by the egress guard on the bus.
   * The guard checks a message against its own SENDER's limits; it never
   * shows one side's limits to the other.
   */
  readonly guardrails: Readonly<
    Record<EnvelopeParty, BuyerGuardrails | SellerGuardrails>
  >;
  /** Injected so transcripts are reproducible. */
  readonly now: () => Date;
}

export interface TurnLoopResult {
  readonly negotiationId: string;
  readonly transcript: readonly Envelope[];
  readonly outcome: "SETTLED" | "WALKED_AWAY";
  readonly terminalMessage: Envelope;
  /** How many times an owner limit overrode a proposal. Demo material. */
  readonly clampCount: number;
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

  // THE EGRESS GUARD. Every outbound message goes through `bus.publish`, and
  // the bus is the only path between the two agents, so a message this guard
  // rejects never reaches the counterparty. It re-derives each sender's band
  // independently of the clamp that produced the message: two checks, one
  // shared pure primitive, so a single bug cannot defeat both.
  //
  // It throws rather than filtering. A breach means the clamp is broken, and
  // a broken clamp invalidates the safety claim, so failing loudly beats
  // quietly dropping a message and continuing.
  bus.addPublishInterceptor((envelope) => {
    assertOutboundWithinBand(options.guardrails[envelope.from], envelope);
  });

  let seq = 0;
  let onTurn: EnvelopeParty = "BUYER";
  let inbound: Envelope | undefined;
  let terminal: Envelope | undefined;

  for (let round = 1; round <= roundCap && terminal === undefined; round += 1) {
    // One round is one message from each side, unless someone terminates.
    for (const _half of [0, 1]) {
      const agent = agentByParty[onTurn];
      const decision = await agent.decide({
        negotiationId,
        inbound,
        history: transcript,
        roundsRemaining: roundCap - round,
        roundCap,
        round,
        seq,
        now,
      });
      const { outbound, decisionState } = decision;

      await bus.publish(outbound);
      messages.append(outbound, decisionState);

      // Persist every clamp that bit while producing this message, keyed to
      // the message's own seq so the transcript can interleave them.
      options.clampEvents.appendMany(
        decision.clampEvents.map((event) => ({
          negotiationId,
          seq: outbound.seq,
          party: event.party,
          severity: "CLAMP" as const,
          bound: event.bound,
          field: event.field,
          proposed: event.proposed,
          clamped: event.clamped,
          explanation: event.explanation,
          createdAt: outbound.createdAt,
        })),
      );

      // The LLM consultation behind this message, if there was one. Written
      // whatever the outcome, including the branches where the model's number
      // was refused: a log that only kept the successes would hide precisely
      // the rows that prove the bounding works.
      if (
        options.llmInvocations !== undefined &&
        decision.llmInvocation !== undefined &&
        decision.llmInvocation !== null
      ) {
        options.llmInvocations.append({
          ...decision.llmInvocation,
          negotiationId,
          seq: outbound.seq,
          createdAt: outbound.createdAt,
        });
      }

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

  return {
    negotiationId,
    transcript,
    outcome,
    terminalMessage: terminal,
    clampCount: options.clampEvents.countByNegotiation(negotiationId),
  };
}
