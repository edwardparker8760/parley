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
import {
  createLlmClient,
  DEFAULT_MODEL_BY_PROVIDER,
} from "./llm-client-factory.js";
import { ReplayLlmClient } from "./recording-and-replay-client.js";
import { buildOfferSelectionPrompt } from "./offer-selection-prompt-builder.js";
import type { LlmClient } from "./llm-client-interface.js";

/** Scenario A settles at round 9: two agents, nine rounds, eighteen calls. */
const TURNS = 18;
/**
 * Per-call timeout, read from config rather than hardcoded.
 *
 * This used to be a fixed 4000ms, which made the harness unable to measure the
 * very thing it exists to measure: if real latency exceeds the production
 * timeout, every call aborts and you learn only "everything failed", not "how
 * slow is it actually". Raise LLM_TIMEOUT_MS to characterise a slow provider,
 * then set the production value from what you find.
 */
const DEFAULT_TIMEOUT_MS = 4000;

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
  const timeoutMs = config.llmTimeoutMs || DEFAULT_TIMEOUT_MS;
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
    const model =
      config.llmModel === ""
        ? DEFAULT_MODEL_BY_PROVIDER[config.llmProvider]
        : config.llmModel;
    client = createLlmClient({
      provider: config.llmProvider,
      apiKey: config.llmApiKey,
      model,
    });
    mode = `live (${config.llmProvider} / ${model})`;
  } else {
    console.error(
      [
        "",
        "CANNOT MEASURE LIVE LATENCY: no LLM_API_KEY is set.",
        "",
        "This measurement is the input to the demo design, so it must be real",
        "rather than assumed. To run it:",
        "",
        "  1. Get a free key at https://aistudio.google.com/apikey",
        "     (free tier needs no billing account)",
        "  2. Put LLM_API_KEY=<key> in .env",
        "  3. pnpm --filter @parley/llm-layer measure-latency",
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
        timeoutMs,
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

  // Refuse to write a report with no successful samples. An earlier version
  // happily emitted "mean 0.00s, fits a 3-minute video" after 18 consecutive
  // failures, which is a fabricated verdict dressed as a measurement. A
  // measurement nobody could take must look like a failure, not like a fast
  // result.
  if (latencies.length === 0) {
    console.error(
      [
        "",
        `ALL ${TURNS} CALLS FAILED. No latency was measured, so no report was written.`,
        "",
        "First failure:",
        `  ${failures[0] ?? "unknown"}`,
        "",
        "Fix the cause and re-run. Nothing is written until at least one call succeeds.",
        "",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

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
    `Per-call timeout: ${timeoutMs}ms`,
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
    ...(failures.length > 0
      ? [
          `**${failures.length} of ${TURNS} calls failed.** The figures above ` +
            "describe only the calls that succeeded, so treat the totals as a " +
            "lower bound and re-run once the failures are resolved.",
          "",
        ]
      : []),
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
