/**
 * Google Gemini client.
 *
 * Surface VERIFIED against the installed `@google/genai@2.15.0` type
 * definitions, not against a blog post or memory. The notes below record what
 * actually differs from the Anthropic path this replaced.
 *
 * ## Structured output: `responseJsonSchema`, not `responseSchema`
 *
 * The SDK offers two mutually exclusive fields on `GenerateContentConfig`:
 *
 *   - `responseSchema` takes Gemini's own `Schema` type, a select subset of
 *     OpenAPI 3.0. Using it would mean hand-writing a SECOND representation of
 *     the same schema in Gemini's vocabulary, which could drift from the zod
 *     schema that validates the response.
 *   - `responseJsonSchema` takes standard JSON Schema. Its documented
 *     supported keywords include `type`, `properties`, `additionalProperties`
 *     and `required`, which is exactly what our schema uses.
 *
 * So this uses `responseJsonSchema` with the SAME constant zod-land already
 * uses. One schema definition, two enforcement points, no drift. The
 * guarantee is unchanged from the Anthropic path: the schema is enforced at
 * generation, and zod re-validates afterwards because model output is
 * untrusted regardless of what any provider promises.
 *
 * `responseMimeType: "application/json"` is REQUIRED alongside it. Omitting it
 * is the most likely way to get prose back instead of JSON.
 *
 * ## Other differences from the Anthropic path
 *
 * - No per-request timeout option on `generateContent`. Anthropic's SDK takes
 *   `{ timeout }` per call; here the timeout has to be imposed from outside
 *   with an AbortSignal, which is what `withTimeout` below does. Without it
 *   the hard 4s bound the bounded selector relies on would not exist.
 * - No `effort` parameter. The Anthropic path used `effort: "low"` to keep
 *   latency down; the Gemini equivalent is choosing a `-flash-lite` model and
 *   capping `maxOutputTokens`.
 * - Response text is a `.text` accessor rather than a content-block array.
 */

import { GoogleGenAI } from "@google/genai";
import type {
  LlmClient,
  OfferSelectionRawResponse,
  OfferSelectionRequest,
} from "./llm-client-interface.js";
import { LlmTransportError } from "./llm-client-interface.js";
import { OFFER_SELECTION_JSON_SCHEMA } from "./llm-offer-response-schema.js";

export interface GeminiLlmClientOptions {
  readonly apiKey: string;
  readonly model: string;
  /** Cap the response. This task needs one number and one sentence. */
  readonly maxOutputTokens?: number;
}

/**
 * Impose a deadline on a promise that has no native timeout option.
 *
 * The bounded selector's contract is a hard per-call bound; without this the
 * TIMEOUT branch would be unreachable and a slow model would stall the demo.
 */
async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export class GeminiLlmClient implements LlmClient {
  readonly name = "gemini";
  readonly #client: GoogleGenAI;
  readonly #model: string;
  readonly #maxOutputTokens: number;

  constructor(options: GeminiLlmClientOptions) {
    if (options.apiKey.length === 0) {
      throw new Error("LLM_API_KEY is empty");
    }
    this.#client = new GoogleGenAI({ apiKey: options.apiKey });
    this.#model = options.model;
    this.#maxOutputTokens = options.maxOutputTokens ?? 256;
  }

  async complete(
    request: OfferSelectionRequest,
  ): Promise<OfferSelectionRawResponse> {
    const startedAt = Date.now();

    try {
      const response = await withTimeout(
        (signal) =>
          this.#client.models.generateContent({
            model: this.#model,
            contents: request.prompt,
            config: {
              // Both fields are required together. responseJsonSchema is the
              // standard-JSON-Schema variant; responseSchema is the OpenAPI
              // subset and is mutually exclusive with it.
              responseMimeType: "application/json",
              responseJsonSchema: OFFER_SELECTION_JSON_SCHEMA,
              maxOutputTokens: this.#maxOutputTokens,
              abortSignal: signal,
            },
          }),
        request.timeoutMs,
      );

      const latencyMs = Date.now() - startedAt;
      const raw = response.text ?? "";
      return { raw, latencyMs, source: "live" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const timedOut = /abort|timeout/i.test(message);
      // Message only. A provider error can carry request context including the
      // key, and it must never reach a log.
      throw new LlmTransportError(message, timedOut);
    }
  }
}
