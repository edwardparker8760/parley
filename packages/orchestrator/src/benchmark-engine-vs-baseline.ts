/**
 * Benchmark: engine versus the phase 02 baseline, on all three scenarios.
 *
 * Regenerates `docs/engine-benchmark.md`, which is judge-facing evidence. It
 * is a committed file rather than console output precisely so that the claim
 * "the engine beats the baseline" can be checked by someone who never runs the
 * code, and so a regression shows up as a diff in review.
 *
 * Run: pnpm benchmark
 *
 * Two numbers are reported per scenario because optimising either one alone is
 * misleading:
 *
 *   - **Rounds to termination.** Fewer is better, but only up to a point. A
 *     negotiation that closes in two rounds has no visible concession ladder,
 *     and the whole differentiator of this project is that you can watch the
 *     agents haggle. Speed that erases the demo is not an improvement.
 *   - **Price quality.** Measured as distance from the true ZOPA midpoint,
 *     which is the neutral "fair" split. A deal struck at one side's limit is
 *     a worse outcome than one struck near the middle, even though both are
 *     legal, because it means one agent captured essentially all the surplus.
 *
 * The oracle is used HERE, in the orchestrator, to compute the true ZOPA. That
 * is legitimate: this is an observer, not a negotiating party. No agent may
 * import it.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { formatMicroAsUsdc } from "@parley/shared";
import type { MicroUsdc } from "@parley/shared";
import { computeTrueZopa } from "@parley/negotiation-engine/oracle";
import type { StrategyName } from "@parley/agents";

import { runScenario } from "./run-negotiation-scenario.js";
import { SCENARIOS } from "./scenario-definitions.js";
import type { ScenarioName } from "./scenario-definitions.js";

interface Row {
  readonly scenario: ScenarioName;
  readonly strategy: StrategyName;
  readonly outcome: string;
  readonly roundsUsed: number;
  readonly messages: number;
  readonly settledPrice: MicroUsdc | null;
  readonly distanceFromMidpoint: MicroUsdc | null;
  readonly clampCount: number;
  readonly correct: boolean;
}

async function measure(
  scenario: ScenarioName,
  strategy: StrategyName,
): Promise<Row> {
  const definition = SCENARIOS[scenario];
  const result = await runScenario({ scenario, strategy });

  const terminal = result.terminalMessage;
  const accepted =
    terminal.type === "ACCEPT"
      ? result.transcript.find((e) => e.seq === terminal.acceptsSeq)
      : undefined;
  const settledPrice =
    accepted !== undefined &&
    (accepted.type === "OFFER" || accepted.type === "COUNTEROFFER")
      ? accepted.offer.unitPriceMicroUsdc
      : null;

  const zopa = computeTrueZopa(
    definition.buyerGuardrails,
    definition.sellerGuardrails,
    definition.buyerGuardrails.targetQuantity,
    definition.terms,
  );

  let distanceFromMidpoint: MicroUsdc | null = null;
  if (
    settledPrice !== null &&
    zopa.exists &&
    zopa.loMicroUsdc !== null &&
    zopa.hiMicroUsdc !== null
  ) {
    const midpoint = (zopa.loMicroUsdc + zopa.hiMicroUsdc) / 2n;
    distanceFromMidpoint =
      settledPrice > midpoint ? settledPrice - midpoint : midpoint - settledPrice;
  }

  // "Correct" means the outcome matches what the scenario is designed to show:
  // a deal where a ZOPA exists, no deal where none does.
  const correct = zopa.exists
    ? result.outcome === "SETTLED"
    : result.outcome === "WALKED_AWAY";

  result.db.close();

  return {
    scenario,
    strategy,
    outcome: result.outcome,
    roundsUsed: terminal.round,
    messages: result.transcript.length,
    settledPrice,
    distanceFromMidpoint,
    clampCount: result.clampCount,
    correct,
  };
}

function formatPrice(value: MicroUsdc | null): string {
  return value === null ? "n/a" : `${value} (${formatMicroAsUsdc(value)} USDC)`;
}

function renderReport(rows: readonly Row[]): string {
  const lines: string[] = [
    "# Engine versus baseline benchmark",
    "",
    "**Regenerate with `pnpm benchmark`.** Do not edit by hand.",
    "",
    "The baseline is the phase 02 fixed-concession strategy: move 20% of the",
    "gap each round, accept when the counterparty's offer is at least as good",
    "as your own next one. The engine adds utility functions, a back-loaded",
    "concession schedule with anti-inference defences, ZOPA inference from",
    "revealed offers, and a terms-for-price trade.",
    "",
    "## Why two numbers",
    "",
    "Rounds alone is a misleading target. A negotiation that closes in two",
    "rounds shows no concession ladder, and being able to watch the agents",
    "haggle is the entire point of the project. So price quality is reported",
    "alongside: distance from the true ZOPA midpoint, where the midpoint is the",
    "neutral split. A deal at one party's own limit means the other captured",
    "essentially all the surplus, which is a worse result than a deal near the",
    "middle even though both are legal.",
    "",
    "## Results",
    "",
    "| Scenario | Strategy | Outcome | Round | Messages | Settled price | Distance from ZOPA midpoint | Clamps | Correct |",
    "|---|---|---|---|---|---|---|---|---|",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.scenario} | ${row.strategy} | ${row.outcome} | ${row.roundsUsed} | ` +
        `${row.messages} | ${formatPrice(row.settledPrice)} | ` +
        `${row.distanceFromMidpoint === null ? "n/a" : row.distanceFromMidpoint.toString()} | ` +
        `${row.clampCount} | ${row.correct ? "yes" : "NO"} |`,
    );
  }

  lines.push("", "## Scenario by scenario", "");

  for (const scenario of ["A", "B", "C"] as const) {
    const baseline = rows.find(
      (r) => r.scenario === scenario && r.strategy === "baseline",
    );
    const engine = rows.find(
      (r) => r.scenario === scenario && r.strategy === "engine",
    );
    if (baseline === undefined || engine === undefined) continue;

    const definition = SCENARIOS[scenario];
    lines.push(`### Scenario ${scenario}: ${definition.label}`, "");
    lines.push(`Expected: ${definition.expectation}`, "");

    const roundDelta = baseline.roundsUsed - engine.roundsUsed;
    const roundVerdict =
      roundDelta > 0
        ? `engine is ${roundDelta} round${roundDelta === 1 ? "" : "s"} faster`
        : roundDelta === 0
          ? "same number of rounds"
          : `engine is ${-roundDelta} round${roundDelta === -1 ? "" : "s"} slower`;

    let priceVerdict = "no settled price to compare";
    if (
      baseline.distanceFromMidpoint !== null &&
      engine.distanceFromMidpoint !== null
    ) {
      const improvement =
        baseline.distanceFromMidpoint - engine.distanceFromMidpoint;
      priceVerdict =
        improvement > 0n
          ? `engine settles ${improvement} micro-USDC closer to the fair midpoint`
          : improvement === 0n
            ? "identical distance from the midpoint"
            : `engine settles ${-improvement} micro-USDC further from the midpoint`;
    }

    lines.push(`- Rounds: ${roundVerdict}.`);
    lines.push(`- Price quality: ${priceVerdict}.`);
    lines.push(
      `- Outcome correctness: baseline ${baseline.correct ? "correct" : "WRONG"}, ` +
        `engine ${engine.correct ? "correct" : "WRONG"}.`,
    );
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

async function main(): Promise<void> {
  const rows: Row[] = [];
  for (const scenario of ["A", "B", "C"] as const) {
    for (const strategy of ["baseline", "engine"] as const) {
      rows.push(await measure(scenario, strategy));
    }
  }

  const report = renderReport(rows);
  const outputPath = resolve(process.cwd(), "../../docs/engine-benchmark.md");
  writeFileSync(outputPath, report, "utf8");

  console.log(report);
  console.log(`written to ${outputPath}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`benchmark failed: ${message}`);
  process.exitCode = 1;
});
