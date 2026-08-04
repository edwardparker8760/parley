/**
 * What an agent is, from the turn loop's point of view.
 *
 * Guardrails are supplied at CONSTRUCTION and never appear in this interface.
 * That is the whole point: neither the turn loop nor the counterparty can see
 * or influence a side's private limits, which is the information asymmetry a
 * real negotiation has (spec section 3).
 *
 * `decide` is pure with respect to its inputs plus the agent's own private
 * config. It must not read the wall clock or a global RNG; anything
 * nondeterministic is injected, so a negotiation replays identically.
 */

import type { Envelope, EnvelopeParty } from "@parley/protocol";
import type { ClampEvent } from "@parley/guardrails";
import type { LlmInvocationRecord } from "./llm-offer-consultation.js";

export interface DecisionInput {
  readonly negotiationId: string;
  /** The counterparty's latest message. Absent only on the opening turn. */
  readonly inbound?: Envelope;
  /** Everything said so far, oldest first, both parties. */
  readonly history: readonly Envelope[];
  /** Full exchanges left before the cap. The loop owns the cap, not the agent. */
  readonly roundsRemaining: number;
  /** Total rounds allowed. Read-only to the agent; the loop enforces it. */
  readonly roundCap: number;
  /** 1-based round this message belongs to. Assigned by the loop. */
  readonly round: number;
  /** Sequence number the loop has reserved for this message. */
  readonly seq: number;
  /** Injected clock, so transcripts are reproducible. */
  readonly now: () => Date;
}

export interface DecisionOutput {
  readonly outbound: Envelope;
  /**
   * Guardrail clamps that bit while producing this message. Empty most turns.
   * The turn loop persists these so the transcript can show the owner's limits
   * overriding the strategy, rather than merely claiming that they would.
   */
  readonly clampEvents: readonly ClampEvent[];
  /**
   * Snapshot of the deterministic state that produced this message. Persisted
   * alongside the envelope so the transcript is auditable after the fact
   * (spec section 4). Shape is strategy-specific and intentionally opaque here.
   */
  readonly decisionState: unknown;
  /**
   * The LLM consultation that produced this message, when there was one.
   *
   * The agent does NOT write it: agents have no ledger access, by design, and
   * handing one a database to log with would put a write path inside the thing
   * holding the private guardrails. So the record travels out with the
   * decision and the turn loop persists it, exactly like `clampEvents`.
   */
  readonly llmInvocation?: LlmInvocationRecord | null;
}

export interface Agent {
  readonly party: EnvelopeParty;
  decide(input: DecisionInput): Promise<DecisionOutput>;
}

/**
 * Which brain an agent runs.
 *
 * "baseline" is the phase 02 fixed-concession strategy, retained as the
 * benchmark the engine must beat and as a one-env-var rollback if the engine
 * misbehaves on demo day.
 */
export type StrategyName = "engine" | "baseline";
