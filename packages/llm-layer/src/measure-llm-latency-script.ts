/**
 * Measures LLM latency per negotiation turn, and total wall clock for a run.
 *
 * Latency is the constraint that decides how the demo is shot, so it gets
 * measured now rather than discovered while recording. One agent turn is one
 * LLM call, so a scenario-A run at 9 rounds is 18 calls: per-call latency times
 * 18 is the dead air in the video.
 *
 * Usage:
 *   pnpm --filter @parley/llm-layer measure-latency            # live, needs a key
 *   pnpm --filter @parley/llm-layer measure-latency --tape p   # replay a tape
 *
 * Writes docs/llm-latency.md.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadConfigFromEnv } from "@parley/shared";
import { AnthropicLlmClient } from "./anthropic-llm-client.js";
import { ReplayLlmClient } from "./recording-and-replay-client.js";
import { buildOfferSelectionPrompt } from "./offer-selection-prompt-builder.js";
import type { LlmClient } from "./llm-client-interface.js";

/** Scenario A settles at round 9: two agents, nine rounds, eighteen calls. */
const TURNS = 18;
const TIMEOUT_MS = 4000;

function promptForTurn(index: number): string {
  const round = Math.floor(index / 2) + 1;
  const isBuyer = index % 2 === 0;
  return buildOfferSelectionPrompt({
    party: isBuyer ? "BUYER" : "SELLER",
    bandLoMicroUsdc: isBuyer ? 0n : 756n,
    bandHiMicroUsdc: isBuyer ? 1200n : 2000n,
    deterministicPickMicroUsdc: isBuyer ? 500n + BigInt(round) * 40n : 1500n - BigInt(round) * 40n,
    round,
    roundCap: 12,
    ownLastOfferMicroUsdc: isBuyer ? 500n : 1500n,
    counterpartyLastOfferMicroUsdc: isBuyer ? 1500n : 500n,
    counterpartyRationale: "I need this to work for my side too.",
    quantity: 10_000,
  });
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.floor(fraction * (sorted.length - 1)),
  );
  return sorted[index] as number;
}

async function main(): Promise<void> {
  const config = loadConfigFromEnv();
  const tapeIndex = process.argv.indexOf("--tape");
  const tapePath = tapeIndex >= 0 ? process.argv[tapeIndex + 1] : undefined;

  let client: LlmClient;
  let mode: string;

  if (tapePath !== undefined) {
    client = ReplayLlmClient.fromFile(tapePath, {
      strict: false,
      simulateLatency: true,
    });
    mode = `replay (${tapePath})`;
  } else if (config.llmApiKey !== undefined) {
    client = new AnthropicLlmClient({
      apiKey: config.llmApiKey,
      model: config.llmModel,
    });
    mode = `live (${config.llmModel})`;
  } else {
    console.error(
      [
        "",
        "CANNOT MEASURE LIVE LATENCY: no LLM_API_KEY is set.",
        "",
        "This measurement is the input to the demo design, so it must be real",
        "rather than assumed. To run it:",
        "",
        "  1. Put LLM_API_KEY=<key> in .env",
        "  2. pnpm --filter @parley/llm-layer measure-latency",
        "",
        "Or measure a recorded tape instead:",
        "  pnpm --filter @parley/llm-layer measure-latency --tape docs/llm-tape.json",
        "",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  console.log(`measuring ${TURNS} turns via ${mode}...`);

  const latencies: number[] = [];
  const failures: string[] = [];
  const startedAt = Date.now();

  for (let index = 0; index < TURNS; index += 1) {
    try {
      const response = await client.complete({
        prompt: promptForTurn(index),
        timeoutMs: TIMEOUT_MS,
      });
      latencies.push(response.latencyMs);
      process.stdout.write(`  turn ${index + 1}/${TURNS}: ${response.latencyMs}ms\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`turn ${index + 1}: ${message}`);
      process.stdout.write(`  turn ${index + 1}/${TURNS}: FAILED (${message})\n`);
    }
  }

  const totalMs = Date.now() - startedAt;
  const sorted = [...latencies].sort((a, b) => a - b);
  const mean =
    latencies.length === 0
      ? 0
      : latencies.reduce((sum, value) => sum + value, 0) / latencies.length;

  const report = [
    "# LLM latency measurement",
    "",
    "**Regenerate with `pnpm --filter @parley/llm-layer measure-latency`.**",
    "",
    `Mode: ${mode}`,
    `Turns measured: ${TURNS} (one LLM call per agent turn; scenario A settles at round 9, so 18 calls)`,
    `Per-call timeout: ${TIMEOUT_MS}ms`,
    "",
    "## Results",
    "",
    "| Metric | Value |",
    "|---|---|",
    `| Total wall clock | ${(totalMs / 1000).toFixed(1)}s |`,
    `| Mean per turn | ${(mean / 1000).toFixed(2)}s |`,
    `| Median (p50) | ${(percentile(sorted, 0.5) / 1000).toFixed(2)}s |`,
    `| p95 | ${(percentile(sorted, 0.95) / 1000).toFixed(2)}s |`,
    `| Slowest | ${(percentile(sorted, 1) / 1000).toFixed(2)}s |`,
    `| Failures | ${failures.length} of ${TURNS} |`,
    "",
    "## What this means for the demo",
    "",
    totalMs > 60_000
      ? `A full scenario-A negotiation costs ${(totalMs / 1000).toFixed(0)}s of dead air, ` +
        "which does not fit a 3-minute video. Ship the demo in `LLM_MODE=replay` " +
        "against a recorded tape, or in `rationale-only` mode."
      : `A full scenario-A negotiation costs ${(totalMs / 1000).toFixed(0)}s. ` +
        "That fits a 3-minute video, but record a tape anyway so the recording " +
        "does not depend on the API behaving on the day.",
    "",
    ...(failures.length > 0 ? ["## Failures", "", ...failures.map((f) => `- ${f}`), ""] : []),
  ].join("\n");

  const outputPath = resolve(process.cwd(), "../../docs/llm-latency.md");
  writeFileSync(outputPath, `${report}\n`, "utf8");
  console.log(`\n${report}`);
  console.log(`written to ${outputPath}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`measure-latency failed: ${message}`);
  process.exitCode = 1;
});
