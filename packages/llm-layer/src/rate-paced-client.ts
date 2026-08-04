/**
 * Spaces out live calls so a negotiation does not trip the provider's rate
 * limit halfway through.
 *
 * ## Why this is needed, with numbers
 *
 * Gemini's free tier allows 15 requests per minute per model. A negotiation is
 * two agents times up to 12 rounds, so up to 24 consultations. The measured
 * 18-call latency run on 2026-08-03 lost 2 calls to `429 RESOURCE_EXHAUSTED`
 * for exactly this reason (`docs/llm-latency.md`).
 *
 * A 429 is not a disaster: the selector treats it as a transport error and
 * falls back to the deterministic pick with a templated rationale, which is the
 * system working as designed. But a demo where a third of the rationales are
 * templated undersells the layer, so pacing buys back the quality for the cost
 * of wall-clock time.
 *
 * This decorator is deliberately NOT applied in replay mode: a tape has no rate
 * limit, which is the whole reason the video runs from one.
 */

import type {
  LlmClient,
  OfferSelectionRawResponse,
  OfferSelectionRequest,
} from "./llm-client-interface.js";

/** 15 requests per minute means one every 4 seconds. 4.3s leaves headroom. */
export const FREE_TIER_MIN_INTERVAL_MS = 4300;

export class RatePacedLlmClient implements LlmClient {
  readonly name: string;
  readonly #inner: LlmClient;
  readonly #minIntervalMs: number;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #clock: () => number;
  #nextAllowedAt = 0;

  constructor(
    inner: LlmClient,
    options: {
      minIntervalMs?: number;
      sleep?: (ms: number) => Promise<void>;
      clock?: () => number;
    } = {},
  ) {
    this.#inner = inner;
    this.#minIntervalMs = options.minIntervalMs ?? FREE_TIER_MIN_INTERVAL_MS;
    this.#sleep =
      options.sleep ??
      ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#clock = options.clock ?? (() => Date.now());
    this.name = inner.name;
  }

  async complete(
    request: OfferSelectionRequest,
  ): Promise<OfferSelectionRawResponse> {
    const waitMs = this.#nextAllowedAt - this.#clock();
    if (waitMs > 0) await this.#sleep(waitMs);
    // Reserved before the call, not after it, so the interval measures call
    // starts. Otherwise a slow call would push the next one out by its own
    // latency on top of the interval.
    this.#nextAllowedAt = this.#clock() + this.#minIntervalMs;
    return await this.#inner.complete(request);
  }
}
