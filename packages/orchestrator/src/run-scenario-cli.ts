/**
 * CLI: run a demo scenario to termination and print the ladder.
 *
 * Usage: pnpm run:scenario A [--db parley-ledger.db] [--record-tape path]
 *
 * The LLM mode comes from `.env`. `off` is fully deterministic, `full` and
 * `rationale-only` call the provider (paced), `replay` reads a recorded tape.
 */

import { formatMicroAsUsdc, loadConfigFromEnv } from "@parley/shared";
import { createSettlementAdapter } from "@parley/settlement";
import type { LlmInvocationRow } from "@parley/ledger";
import { SCENARIOS, isScenarioName } from "./scenario-definitions.js";
import { runScenario } from "./run-negotiation-scenario.js";
import { buildLlmSettingsFromConfig } from "./build-llm-settings-from-config.js";
import type { FinaliseResult } from "./finalise-negotiation-outcome.js";

/**
 * Settlement and walk-away panels, printed in the terminal.
 *
 * The SIMULATED line is not decoration. If it ever disappears while the stub
 * adapter is in use, a screenshot of this output becomes a claim that money
 * moved when it did not.
 */
function renderOutcome(finalisation: FinaliseResult): string {
  if (finalisation.walkAway !== undefined) {
    const { buyer, seller, zopa } = finalisation.walkAway;
    return [
      "",
      "WALK-AWAY POST-MORTEMS",
      `  a deal was ${zopa.exists ? "possible" : "IMPOSSIBLE"}` +
        (zopa.blockingCause === null ? "" : `: ${zopa.blockingCause}`),
      `  BUYER  [${buyer.postMortem.reasonCode}] ${buyer.postMortem.explanation}`,
      `  SELLER [${seller.postMortem.reasonCode}] ${seller.postMortem.explanation}`,
      "  no payment was made.",
    ].join("\n");
  }

  const { deal, receipt } = finalisation;
  if (deal === undefined) return "";
  const lines = [
    "",
    "SETTLEMENT",
    `  amount    ${formatMicroAsUsdc(deal.amountMicroUsdc)} USDC ` +
      `(${deal.quantity} calls at ${deal.unitPriceMicroUsdc} micro-USDC)`,
    `  termsHash ${deal.termsHash}`,
  ];
  if (receipt === undefined) {
    lines.push("  status    NOT ATTEMPTED (no settlement adapter supplied)");
    return lines.join("\n");
  }
  lines.push(
    `  adapter   ${receipt.adapter}${receipt.isStub ? "  [SIMULATED: no real money moved]" : ""}`,
    `  status    ${receipt.status} in ${receipt.latencyMs ?? "?"}ms`,
    `  reference ${receipt.reference ?? receipt.error ?? "none"}`,
  );
  if (receipt.explorerUrl !== null) lines.push(`  explorer  ${receipt.explorerUrl}`);
  return lines.join("\n");
}

/**
 * The LLM panel: how many times the model was consulted, and how often
 * arithmetic overruled it.
 *
 * The overruled rows are the interesting ones. A run where every consultation
 * came back ACCEPTED proves nothing about the bounding; a run with an
 * OUT_OF_BAND row shows the model asking for a number it did not get.
 */
function renderLlmPanel(rows: readonly LlmInvocationRow[], wallMs: number): string {
  if (rows.length === 0) return "";

  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.outcome] = (counts[row.outcome] ?? 0) + 1;

  const latencies = rows.map((row) => row.latencyMs).sort((a, b) => a - b);
  const median = latencies[Math.floor(latencies.length / 2)] ?? 0;

  const lines = [
    "",
    "LLM CONSULTATIONS",
    `  mode      ${rows[0]?.mode} via ${rows[0]?.model}`,
    `  calls     ${rows.length}, median ${median}ms, ` +
      `${(wallMs / 1000).toFixed(1)}s wall clock for the negotiation`,
    `  outcomes  ${Object.entries(counts)
      .map(([outcome, n]) => `${outcome}=${n}`)
      .join(" ")}`,
  ];

  for (const row of rows) {
    if (row.rejectedPriceMicroUsdc === null) continue;
    lines.push(
      `  seq ${row.seq} ${row.party}: model asked ${row.rejectedPriceMicroUsdc}, ` +
        `sent ${row.finalPriceMicroUsdc}. Arithmetic won.`,
    );
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const requested = process.argv[2] ?? "A";
  if (!isScenarioName(requested)) {
    throw new Error(
      `Unknown scenario "${requested}". Expected one of A, B, C.`,
    );
  }

  const dbFlagIndex = process.argv.indexOf("--db");
  const location =
    dbFlagIndex >= 0 ? process.argv[dbFlagIndex + 1] : undefined;

  const definition = SCENARIOS[requested];
  console.log(
    `scenario ${definition.name}: ${definition.label}\n` +
      `expected: ${definition.expectation}\n`,
  );

  // Fails loudly if arc-x402 is selected without keys, rather than quietly
  // settling on the stub and calling it real.
  const config = loadConfigFromEnv();
  const settlement = createSettlementAdapter(config);

  const tapeFlagIndex = process.argv.indexOf("--record-tape");
  const tapePath = tapeFlagIndex >= 0 ? process.argv[tapeFlagIndex + 1] : undefined;
  const llm = buildLlmSettingsFromConfig(config, {
    recordTape: tapePath !== undefined,
  });

  if (llm.settings.mode !== "off") {
    console.log(`llm: ${llm.settings.mode} via ${llm.settings.client?.name}\n`);
  }

  const startedAt = Date.now();
  const result = await runScenario({
    scenario: requested,
    location: location ?? ":memory:",
    settlement,
    buyerAddress: config.buyerWalletAddress,
    sellerAddress: config.sellerWalletAddress,
    llm: llm.settings,
  });
  const wallMs = Date.now() - startedAt;

  console.log(result.ladder);
  console.log(renderOutcome(result.finalisation));
  console.log(renderLlmPanel(result.llmInvocations, wallMs));

  if (tapePath !== undefined && llm.recorder !== null) {
    const tape = llm.recorder.writeTape(tapePath);
    console.log(
      `\nrecorded ${tape.entries.length} responses to ${tapePath}. ` +
        `Replay with LLM_MODE=replay LLM_TAPE_PATH=${tapePath}.`,
    );
  }

  if (location !== undefined) {
    console.log(
      `\npersisted to ${location}. Replay with:` +
        `\n  pnpm replay ${result.negotiationId} --db ${location}`,
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`run:scenario failed: ${message}`);
  process.exitCode = 1;
});
