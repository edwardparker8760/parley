/**
 * Turns `.env` into the LLM settings the agents take, and nothing more.
 *
 * Kept out of the CLI so that the demo path and any future dashboard build the
 * client the same way. Three decisions live here:
 *
 *   1. Live modes are PACED. The free tier is 15 requests per minute and a
 *      negotiation makes up to 24 calls, so an unpaced run loses calls to 429s.
 *   2. Replay is NOT paced. A tape has no rate limit, and instant replay is why
 *      the video runs from one.
 *   3. Recording wraps the live client only. Recording a replay would write a
 *      tape from a tape.
 */

import { createClientForMode, RatePacedLlmClient, RecordingLlmClient } from "@parley/llm-layer";
import { DEFAULT_MODEL_BY_PROVIDER } from "@parley/llm-layer";
import type { AgentLlmSettings } from "@parley/agents";
import type { ParleyConfig } from "@parley/shared";

export interface LlmRunSettings {
  readonly settings: AgentLlmSettings;
  /** Present only when this run is recording a tape. */
  readonly recorder: RecordingLlmClient | null;
}

export function buildLlmSettingsFromConfig(
  config: ParleyConfig,
  options: { recordTape?: boolean; minIntervalMs?: number } = {},
): LlmRunSettings {
  const base = createClientForMode({
    mode: config.llmMode,
    provider: config.llmProvider,
    apiKey: config.llmApiKey,
    ...(config.llmModel !== "" ? { model: config.llmModel } : {}),
    tapePath: config.llmTapePath,
  });

  if (base === null) {
    return {
      settings: { mode: "off", client: null, timeoutMs: config.llmTimeoutMs },
      recorder: null,
    };
  }

  if (config.llmMode === "replay") {
    return {
      settings: { mode: "replay", client: base, timeoutMs: config.llmTimeoutMs },
      recorder: null,
    };
  }

  const paced = new RatePacedLlmClient(
    base,
    options.minIntervalMs !== undefined
      ? { minIntervalMs: options.minIntervalMs }
      : {},
  );

  if (options.recordTape !== true) {
    return {
      settings: { mode: config.llmMode, client: paced, timeoutMs: config.llmTimeoutMs },
      recorder: null,
    };
  }

  const model =
    config.llmModel !== ""
      ? config.llmModel
      : DEFAULT_MODEL_BY_PROVIDER[config.llmProvider];
  const recorder = new RecordingLlmClient(paced, model);

  return {
    settings: {
      mode: config.llmMode,
      client: recorder,
      timeoutMs: config.llmTimeoutMs,
    },
    recorder,
  };
}
