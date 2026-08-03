/**
 * Anthropic client. RETAINED ALTERNATIVE, not the default.
 *
 * The default provider is Gemini (spec.md section 5.1, decided 2026-08-03, on
 * cost: free tier). This client stays behind the same `LlmClient` interface and
 * is selectable with `LLM_PROVIDER=anthropic`, so the swap is reversible with a
 * config change rather than a code change. That reversibility is the reason it
 * was kept rather than deleted.
 *
 * Two choices worth stating:
 *
 * 1. **Structured outputs, not free-text parsing.** The response schema is
 *    handed to the API via `output_config.format`, so the model is constrained
 *    at generation time rather than being asked politely for JSON and parsed
 *    hopefully. The zod re-validation downstream still runs: model output is
 *    untrusted regardless of what the provider enforces.
 *
 * 2. **Low effort, thinking left on.** This call picks one number inside a
 *    given range and writes one sentence. It does not need deep reasoning, and
 *    latency is the scarce resource in a negotiation of up to 24 calls.
 *
 *    HISTORICAL NOTE (2026-08-03, Anthropic path only): disabling thinking
 *    outright was rejected because on the Opus models of that date it carried a
 *    known failure mode, internal reasoning tags leaking into the visible
 *    response. That finding is what motivated `effort: "low"` with thinking
 *    left at its default here. It describes the Anthropic path as it stood
 *    then, NOT current behaviour of the default Gemini path, which has no
 *    effort parameter and no equivalent failure mode. Re-verify before relying
 *    on it if this client is ever promoted back to the default.
 *
 * The API key is read from config and never logged. Errors are re-thrown as
 * LlmTransportError with the message only, never the request context, because
 * a provider error object can echo headers back.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, OfferSelectionRawResponse, OfferSelectionRequest } from "./llm-client-interface.js";
import { LlmTransportError } from "./llm-client-interface.js";
import { OFFER_SELECTION_JSON_SCHEMA } from "./llm-offer-response-schema.js";

/**
 * Model families that accept `output_config.effort`.
 *
 * This is an ALLOWLIST on purpose, and the direction matters. Sending `effort`
 * to a model that does not support it is a hard 400 that breaks every call;
 * omitting it on a model that does support it merely loses a latency
 * optimisation and still returns a correct answer. So the fail-safe default is
 * to omit unless the model is known to accept it.
 *
 * Concretely: `effort` errors on Haiku 4.5 and Sonnet 4.5. Without this check,
 * flipping the provider to Anthropic with a Haiku model would 400 on every
 * request, which would make the documented "config change, not a rewrite"
 * rollback untrue.
 */
const EFFORT_SUPPORTED_PREFIXES: readonly string[] = [
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-opus-4-5",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-fable-5",
  "claude-mythos-5",
];

function modelAcceptsEffort(model: string): boolean {
  return EFFORT_SUPPORTED_PREFIXES.some((prefix) => model.startsWith(prefix));
}

export interface AnthropicLlmClientOptions {
  readonly apiKey: string;
  readonly model: string;
  /** Called with every completed exchange, for the record/replay tape. */
  readonly onExchange?: (prompt: string, raw: string, latencyMs: number) => void;
}

export class AnthropicLlmClient implements LlmClient {
  readonly name = "anthropic";
  readonly #client: Anthropic;
  readonly #model: string;
  readonly #onExchange: AnthropicLlmClientOptions["onExchange"];

  constructor(options: AnthropicLlmClientOptions) {
    if (options.apiKey.length === 0) {
      throw new Error("LLM_API_KEY is empty");
    }
    this.#client = new Anthropic({ apiKey: options.apiKey });
    this.#model = options.model;
    this.#onExchange = options.onExchange;
  }

  async complete(
    request: OfferSelectionRequest,
  ): Promise<OfferSelectionRawResponse> {
    const startedAt = Date.now();

    try {
      const response = await this.#client.messages.create(
        {
          model: this.#model,
          max_tokens: 512,
          output_config: {
            // Structured output is supported across the current models,
            // including Haiku 4.5. Effort is not, hence the capability check.
            ...(modelAcceptsEffort(this.#model) ? { effort: "low" } : {}),
            format: {
              type: "json_schema",
              schema: OFFER_SELECTION_JSON_SCHEMA,
            },
          },
          messages: [{ role: "user", content: request.prompt }],
        } as Parameters<Anthropic["messages"]["create"]>[0],
        { timeout: request.timeoutMs },
      );

      const latencyMs = Date.now() - startedAt;

      const raw = ("content" in response ? response.content : [])
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      this.#onExchange?.(request.prompt, raw, latencyMs);
      return { raw, latencyMs, source: "live" };
    } catch (error) {
      const timedOut =
        error instanceof Anthropic.APIConnectionTimeoutError ||
        (error instanceof Error && /timeout|aborted/i.test(error.message));
      // Message only. A provider error object can carry request context
      // including headers, and the API key must never reach a log.
      const message = error instanceof Error ? error.message : String(error);
      throw new LlmTransportError(message, timedOut);
    }
  }
}
