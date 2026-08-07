/**
 * Wires a scenario definition into a runnable negotiation.
 *
 * Shared by the CLI and by the tests, so what the tests assert on is exactly
 * what the demo runs.
 *
 * Note the guardrail plumbing: each agent is constructed with only its OWN
 * guardrails, and the pair handed to the turn loop is used solely by the bus
 * egress guard, which checks a message against its own sender's limits. There
 * is deliberately no path by which one side can read the other's band.
 */

import { createBuyerAgent, createSellerAgent } from "@parley/agents";
import type { AgentLlmSettings, StrategyName } from "@parley/agents";
import { InProcessMessageBus } from "@parley/protocol";
import {
  ClampEventRepository,
  LlmInvocationRepository,
  MessageRepository,
  NegotiationRepository,
  openLedger,
  renderLadder,
} from "@parley/ledger";
import type { Database, LlmInvocationRow } from "@parley/ledger";
import type { SettlementAdapter } from "@parley/settlement";
import { runNegotiation } from "./negotiation-turn-loop.js";
import type { TurnLoopResult } from "./negotiation-turn-loop.js";
import { finaliseNegotiationOutcome } from "./finalise-negotiation-outcome.js";
import type { FinaliseResult } from "./finalise-negotiation-outcome.js";
import { SCENARIOS } from "./scenario-definitions.js";
import type { ScenarioDefinition, ScenarioName } from "./scenario-definitions.js";

export interface RunScenarioOptions {
  readonly scenario: ScenarioName;
  /**
   * "engine" (default) or "baseline". The baseline is the phase 02 strategy,
   * kept as both the benchmark and a one-flag rollback.
   */
  readonly strategy?: StrategyName;
  /** Database location. ":memory:" for tests. */
  readonly location?: string;
  readonly negotiationId?: string;
  /**
   * Injected clock. Defaults to a FIXED start advancing one second per call,
   * so two runs of the same scenario produce identical transcripts and the
   * replay comparison is meaningful.
   */
  readonly now?: () => Date;
  /**
   * Settlement adapter used ONLY on ACCEPT. Absent means the deal is recorded
   * but no settlement is attempted, which is what the walk-away tests want and
   * what keeps the default test run free of artificial stub latency.
   */
  readonly settlement?: SettlementAdapter;
  readonly buyerAddress?: string;
  readonly sellerAddress?: string;
  /**
   * Bounded LLM settings, shared by both agents.
   *
   * Absent means fully deterministic: no calls, no log rows, and outcomes
   * identical to phase 04. Tests rely on that, and so does the demo rollback.
   *
   * Both sides deliberately get the SAME client. They still cannot see each
   * other: each agent builds its prompt from its own state only, and the
   * client is a transport, not a shared memory.
   */
  readonly llm?: AgentLlmSettings;
  /** Presentation pacing for the dashboard. Default 0, so tests stay fast. */
  readonly turnDelayMs?: number;
  /**
   * Fixes the agents' jitter independently of the negotiation id.
   *
   * Defaults to the id, which is what the CLI and the tests want. The dashboard
   * sets it to the scenario name so that every run of scenario B produces the
   * same negotiation while still getting a fresh ledger row.
   */
  readonly seedKey?: string;
  /** Where the ledger lives, when the caller opened it. Enables live reads. */
  readonly db?: Database;
  /**
   * Run these guardrails instead of the named scenario's.
   *
   * This is what lets a visitor set their own limits. The three scenarios stay
   * exactly as they are; this is an additional door, not a change to them.
   *
   * The whole definition is replaced rather than individual fields, because
   * openings, terms and beta have to be consistent with the bands they run
   * inside. A caller that overrode only `buyerGuardrails` could produce an
   * opening offer outside its own band, which the egress guard would treat as
   * a broken clamp and throw on.
   *
   * `buildNegotiationView` takes the SAME override. It derives the limits and
   * the overlap from the definition, so a custom run read back with the
   * scenario's definition would render scenario A's numbers over a completely
   * different negotiation.
   */
  readonly definition?: ScenarioDefinition;
}

export interface RunScenarioResult extends TurnLoopResult {
  readonly db: Database;
  readonly ladder: string;
  /** Deal plus receipt on ACCEPT, both post-mortems on WALK_AWAY. */
  readonly finalisation: FinaliseResult;
  /** Every LLM consultation this run made. Empty when the run was deterministic. */
  readonly llmInvocations: LlmInvocationRow[];
}

/** Deterministic clock: fixed epoch, +1s per call. */
export function createDeterministicClock(
  startIso = "2026-08-03T00:00:00.000Z",
): () => Date {
  let tick = 0;
  const start = new Date(startIso).getTime();
  return () => new Date(start + tick++ * 1000);
}

/** First unused id of the form `<prefix>-negotiation[-N]`. */
function nextFreeNegotiationId(
  negotiations: NegotiationRepository,
  prefix: string,
): string {
  const base = `${prefix}-negotiation`;
  if (negotiations.findById(base) === undefined) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (negotiations.findById(candidate) === undefined) return candidate;
  }
  throw new Error(
    `Could not find a free negotiation id for "${base}" after 1000 tries.`,
  );
}

export async function runScenario(
  options: RunScenarioOptions,
): Promise<RunScenarioResult> {
  const definition = options.definition ?? SCENARIOS[options.scenario];

  // An injected database is what lets the dashboard read the ladder WHILE it is
  // being written: same connection, same process, no polling a file that a
  // second connection has not flushed yet.
  const db = options.db ?? openLedger({ location: options.location ?? ":memory:" });
  const negotiations = new NegotiationRepository(db);
  const messages = new MessageRepository(db);
  const clampEvents = new ClampEventRepository(db);
  const llmInvocations = new LlmInvocationRepository(db);

  // An explicit id is used verbatim, so tests stay deterministic and a
  // collision surfaces as an error rather than being papered over. An implicit
  // id gets a free suffix, so re-running a scenario against a persisted
  // database during the demo does not collide with the previous run.
  const negotiationId =
    options.negotiationId ??
    nextFreeNegotiationId(negotiations, definition.name.toLowerCase());

  const now = options.now ?? createDeterministicClock();

  const result = await runNegotiation({
    negotiationId,
    scenario: definition.name,
    roundCap: definition.roundCap,
    buyer: createBuyerAgent(definition.buyerGuardrails, {
      openingUnitPriceMicroUsdc: definition.buyerOpeningMicroUsdc,
      terms: definition.terms,
      strategy: options.strategy ?? "engine",
      beta: definition.beta,
      ...(options.llm !== undefined ? { llm: options.llm } : {}),
      ...(options.seedKey !== undefined ? { seedKey: options.seedKey } : {}),
    }),
    seller: createSellerAgent(definition.sellerGuardrails, {
      openingUnitPriceMicroUsdc: definition.sellerOpeningMicroUsdc,
      terms: definition.terms,
      strategy: options.strategy ?? "engine",
      beta: definition.beta,
      ...(options.llm !== undefined ? { llm: options.llm } : {}),
      ...(options.seedKey !== undefined ? { seedKey: options.seedKey } : {}),
    }),
    bus: new InProcessMessageBus(),
    negotiations,
    messages,
    clampEvents,
    llmInvocations,
    guardrails: {
      BUYER: definition.buyerGuardrails,
      SELLER: definition.sellerGuardrails,
    },
    now,
    ...(options.turnDelayMs !== undefined
      ? { turnDelayMs: options.turnDelayMs }
      : {}),
  });

  const ladder = renderLadder(
    result.transcript,
    {
      negotiationId,
      scenario: definition.name,
      roundCap: definition.roundCap,
    },
    clampEvents.listByNegotiation(negotiationId),
  );

  // Terminal hooks run AFTER the transcript is committed, so a slow or failing
  // settlement can never damage the negotiation record.
  const lastOffer = [...result.transcript]
    .reverse()
    .find((envelope) => envelope.type === "OFFER" || envelope.type === "COUNTEROFFER");

  const finalisation = await finaliseNegotiationOutcome({
    db,
    negotiationId,
    transcript: result.transcript,
    terminal: result.terminalMessage,
    roundsUsed: result.terminalMessage.round,
    settlement: options.settlement,
    buyerAddress: options.buyerAddress,
    sellerAddress: options.sellerAddress,
    reportInput: {
      buyerGuardrails: definition.buyerGuardrails,
      sellerGuardrails: definition.sellerGuardrails,
      // Bands are evaluated at the quantity and terms actually on the table at
      // the end, not at the opening ones.
      quantity:
        lastOffer !== undefined && "offer" in lastOffer
          ? lastOffer.offer.quantity
          : definition.buyerGuardrails.targetQuantity,
      terms:
        lastOffer !== undefined && "offer" in lastOffer
          ? lastOffer.offer.terms
          : definition.terms,
    },
    now,
  });

  return {
    ...result,
    db,
    ladder,
    finalisation,
    llmInvocations: llmInvocations.listByNegotiation(negotiationId),
  };
}
