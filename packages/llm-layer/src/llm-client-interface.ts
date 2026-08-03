/**
 * The LLM boundary.
 *
 * Everything above this interface is provider-agnostic, which is what makes the
 * record-and-replay client possible: replay is just another implementation, so
 * the bounded selector cannot tell a recorded run from a live one.
 *
 * Deliberately tiny. The superseded plan's multi-provider abstraction is not
 * carried over (YAGNI): one provider, one model, one call shape.
 */

export interface OfferSelectionRequest {
  /** Full prompt text. Built from OWN state only; see the prompt builder. */
  readonly prompt: string;
  /** Milliseconds before the call is abandoned and the fallback fires. */
  readonly timeoutMs: number;
}

export interface OfferSelectionRawResponse {
  /** Raw model output, verbatim. Persisted as the evidence trail. */
  readonly raw: string;
  readonly latencyMs: number;
  /** Recorded so a replay can be told apart from a live call at a glance. */
  readonly source: "live" | "replay";
}

export interface LlmClient {
  readonly name: string;
  complete(request: OfferSelectionRequest): Promise<OfferSelectionRawResponse>;
}

/** Transport failure or timeout. Never a validation failure. */
export class LlmTransportError extends Error {
  readonly isTimeout: boolean;

  constructor(message: string, isTimeout: boolean) {
    super(message);
    this.name = "LlmTransportError";
    this.isTimeout = isTimeout;
  }
}
