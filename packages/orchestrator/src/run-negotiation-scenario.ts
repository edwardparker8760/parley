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
import type { StrategyName } from "@parley/agents";
import { InProcessMessageBus } from "@parley/protocol";
import {
  ClampEventRepository,
  MessageRepository,
  NegotiationRepository,
  openLedger,
  renderLadder,
} from "@parley/ledger";
import type { Database } from "@parley/ledger";
import { runNegotiation } from "./negotiation-turn-loop.js";
import type { TurnLoopResult } from "./negotiation-turn-loop.js";
import { SCENARIOS } from "./scenario-definitions.js";
import type { ScenarioName } from "./scenario-definitions.js";

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
}

export interface RunScenarioResult extends TurnLoopResult {
  readonly db: Database;
  readonly ladder: string;
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
  const definition = SCENARIOS[options.scenario];

  const db = openLedger({ location: options.location ?? ":memory:" });
  const negotiations = new NegotiationRepository(db);
  const messages = new MessageRepository(db);
  const clampEvents = new ClampEventRepository(db);

  // An explicit id is used verbatim, so tests stay deterministic and a
  // collision surfaces as an error rather than being papered over. An implicit
  // id gets a free suffix, so re-running a scenario against a persisted
  // database during the demo does not collide with the previous run.
  const negotiationId =
    options.negotiationId ??
    nextFreeNegotiationId(negotiations, definition.name.toLowerCase());

  const result = await runNegotiation({
    negotiationId,
    scenario: definition.name,
    roundCap: definition.roundCap,
    buyer: createBuyerAgent(definition.buyerGuardrails, {
      openingUnitPriceMicroUsdc: definition.buyerOpeningMicroUsdc,
      terms: definition.terms,
      strategy: options.strategy ?? "engine",
      beta: definition.beta,
    }),
    seller: createSellerAgent(definition.sellerGuardrails, {
      openingUnitPriceMicroUsdc: definition.sellerOpeningMicroUsdc,
      terms: definition.terms,
      strategy: options.strategy ?? "engine",
      beta: definition.beta,
    }),
    bus: new InProcessMessageBus(),
    negotiations,
    messages,
    clampEvents,
    guardrails: {
      BUYER: definition.buyerGuardrails,
      SELLER: definition.sellerGuardrails,
    },
    now: options.now ?? createDeterministicClock(),
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

  return { ...result, db, ladder };
}
