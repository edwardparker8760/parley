/**
 * THE ONE PLACE A PROVIDER IS CHOSEN.
 *
 * Provider-specific code lives in exactly two files: the concrete client
 * (`gemini-llm-client.ts`, `anthropic-llm-client.ts`) and this factory. Nothing
 * else in the layer knows which provider is in use, because everything above
 * talks to `LlmClient`.
 *
 * That is what made the Anthropic-to-Gemini swap a two-file change rather than
 * a sweep through the prompt builder, the selector, the sanitiser and the
 * tests, and it is why the injection suite needed no edit at all: those tests
 * inject a captured `LlmClient` directly, so they are provider-agnostic by
 * construction.
 *
 * `DEFAULT_MODEL_BY_PROVIDER` is the only place a model name is written down.
 */

import { AnthropicLlmClient } from "./anthropic-llm-client.js";
import { GeminiLlmClient } from "./gemini-llm-client.js";
import type { LlmClient } from "./llm-client-interface.js";
import { ReplayLlmClient } from "./recording-and-replay-client.js";

export type LlmProvider = "gemini" | "anthropic";

/**
 * Default model per provider.
 *
 * Gemini: `gemini-3.5-flash-lite`. Chosen on 2026-08-03 by checking the live
 * pricing page rather than from memory. Reasons, in order:
 *
 *   1. It is on the FREE tier ("Free of charge" for standard input/output on
 *      ai.google.dev/gemini-api/docs/pricing).
 *   2. It is a STABLE model, not a preview. Preview IDs churn, and a demo that
 *      has to be re-recordable in a week should not depend on one.
 *   3. It is the fastest tier Google publishes. This call picks one number
 *      inside a supplied range and writes one sentence; it needs speed, not
 *      reasoning depth, and latency times 18 calls is the video's dead air.
 *
 * `gemini-3.1-pro-preview` is explicitly NOT free-tier, and the `-pro` models
 * are the wrong trade for this task even where they are.
 */
export const DEFAULT_MODEL_BY_PROVIDER: Record<LlmProvider, string> = {
  gemini: "gemini-3.5-flash-lite",
  anthropic: "claude-opus-5",
};

export interface CreateLlmClientOptions {
  readonly provider: LlmProvider;
  readonly apiKey: string;
  /** Overrides the provider default. */
  readonly model?: string;
}

export function createLlmClient(options: CreateLlmClientOptions): LlmClient {
  const model = options.model ?? DEFAULT_MODEL_BY_PROVIDER[options.provider];

  switch (options.provider) {
    case "gemini":
      return new GeminiLlmClient({ apiKey: options.apiKey, model });
    case "anthropic":
      return new AnthropicLlmClient({ apiKey: options.apiKey, model });
  }
}

/**
 * Build whichever client the run needs, including the replay tape.
 *
 * Replay deliberately needs no API key and no provider: a recorded tape is
 * provider-agnostic, so a tape cut against Gemini replays unchanged even if
 * the provider is swapped again later.
 */
export function createClientForMode(input: {
  mode: "off" | "rationale-only" | "full" | "replay";
  provider: LlmProvider;
  apiKey: string | undefined;
  model?: string;
  tapePath?: string;
}): LlmClient | null {
  if (input.mode === "off") return null;

  if (input.mode === "replay") {
    if (input.tapePath === undefined) {
      throw new Error("LLM_MODE=replay requires LLM_TAPE_PATH");
    }
    return ReplayLlmClient.fromFile(input.tapePath, { strict: true });
  }

  if (input.apiKey === undefined) {
    throw new Error(
      `LLM_MODE=${input.mode} requires LLM_API_KEY. ` +
        `Use LLM_MODE=off for templated rationales, or LLM_MODE=replay with a tape.`,
    );
  }

  return createLlmClient({
    provider: input.provider,
    apiKey: input.apiKey,
    ...(input.model !== undefined ? { model: input.model } : {}),
  });
}
