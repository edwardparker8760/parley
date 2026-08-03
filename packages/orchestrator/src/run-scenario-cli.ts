/**
 * CLI: run a demo scenario to termination and print the ladder.
 *
 * Usage: pnpm run:scenario A [--db parley-ledger.db]
 */

import { SCENARIOS, isScenarioName } from "./scenario-definitions.js";
import { runScenario } from "./run-negotiation-scenario.js";

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

  const result = await runScenario({
    scenario: requested,
    location: location ?? ":memory:",
  });

  console.log(result.ladder);

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
