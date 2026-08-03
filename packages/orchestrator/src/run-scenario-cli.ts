/**
 * CLI: run a demo scenario to termination and print the ladder.
 *
 * Usage: pnpm run:scenario A [--db parley-ledger.db]
 */

import { formatMicroAsUsdc, loadConfigFromEnv } from "@parley/shared";
import { createSettlementAdapter } from "@parley/settlement";
import { SCENARIOS, isScenarioName } from "./scenario-definitions.js";
import { runScenario } from "./run-negotiation-scenario.js";
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

  const result = await runScenario({
    scenario: requested,
    location: location ?? ":memory:",
    settlement,
    buyerAddress: config.buyerWalletAddress,
    sellerAddress: config.sellerWalletAddress,
  });

  console.log(result.ladder);
  console.log(renderOutcome(result.finalisation));

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
