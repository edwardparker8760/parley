/**
 * THE BOUNDING LOGIC. The LLM proposes; this decides what survives.
 *
 * Every branch returns the same result shape, so the caller has no branching to
 * get wrong. The five outcomes are all normal operating states, not incidents:
 *
 *   ACCEPTED       LLM picked inside the band; use its number and its words.
 *   OUT_OF_BAND    LLM picked outside the band; DISCARD the number, KEEP the
 *                  words. This is the good demo moment: the dashboard can show
 *                  "the model wanted 1450, arithmetic said 900" with the
 *                  model's own sentence beside it.
 *   SCHEMA_INVALID Response did not parse. Deterministic pick, templated words.
 *   TIMEOUT        Model too slow. Deterministic pick, templated words.
 *   ERROR          Transport failure. Deterministic pick, templated words.
 *
 * There is no retry on a validation failure. Re-prompting a model that just
 * returned the wrong shape burns latency for a marginal chance of improvement,
 * and latency is the scarce resource in a 24-call negotiation.
 *
 * ## What this module does NOT do
 *
 * It does not enforce the owner's limits. It picks a number inside a band that
 * was computed upstream, and the phase 03 clamp re-validates afterwards
 * regardless of which branch fired. Even if every line of this file were
 * compromised, an out-of-band offer still could not reach the counterparty:
 * the clamp would move it and the independent bus egress guard would reject it.
 * That is why prompt injection through the negotiation channel cannot move a
 * price, and it is what `prompt-injection-through-negotiation.test.ts` proves.
 */

import { createHash } from "node:crypto";
import type { MicroUsdc } from "@parley/shared";
import type { LlmClient } from "./llm-client-interface.js";
import { LlmTransportError } from "./llm-client-interface.js";
import { parseOfferSelectionResponse } from "./llm-offer-response-schema.js";
import { buildOfferSelectionPrompt } from "./offer-selection-prompt-builder.js";
import type { PromptInputs } from "./offer-selection-prompt-builder.js";
import { sanitiseRationale } from "./rationale-sanitiser.js";
import { buildTemplatedRationale } from "./templated-rationale-fallback.js";
import type { TemplateInputs } from "./templated-rationale-fallback.js";

export type SelectionOutcome =
  | "ACCEPTED"
  | "OUT_OF_BAND"
  | "SCHEMA_INVALID"
  | "TIMEOUT"
  | "ERROR"
  | "LLM_OFF";

export type LlmMode = "off" | "rationale-only" | "full" | "replay";

export interface SelectionResult {
  /** The price that will actually be proposed. Always inside the band. */
  readonly unitPriceMicroUsdc: MicroUsdc;
  readonly rationale: string;
  readonly outcome: SelectionOutcome;
  readonly usedFallback: boolean;
  /** What the model asked for, when it asked for something illegal. */
  readonly rejectedPriceMicroUsdc: MicroUsdc | null;
  readonly latencyMs: number;
  readonly rawResponse: string | null;
  readonly promptHash: string;
}

export interface SelectorInputs {
  readonly mode: LlmMode;
  readonly client: LlmClient | null;
  readonly timeoutMs: number;
  readonly prompt: PromptInputs;
  readonly template: TemplateInputs;
  /** Injected for testing; defaults to sha256. */
  readonly hashPrompt?: (prompt: string) => string;
}

function clampIntoBand(
  value: MicroUsdc,
  lo: MicroUsdc,
  hi: MicroUsdc,
): MicroUsdc {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

function isWithin(value: MicroUsdc, lo: MicroUsdc, hi: MicroUsdc): boolean {
  return value >= lo && value <= hi;
}

export async function selectOfferWithBoundedLlm(
  inputs: SelectorInputs,
): Promise<SelectionResult> {
  const deterministic = clampIntoBand(
    inputs.prompt.deterministicPickMicroUsdc,
    inputs.prompt.bandLoMicroUsdc,
    inputs.prompt.bandHiMicroUsdc,
  );
  const templated = buildTemplatedRationale(inputs.template);

  const fallback = (
    outcome: SelectionOutcome,
    latencyMs: number,
    raw: string | null,
    promptHash: string,
    rejected: MicroUsdc | null = null,
    rationale: string = templated,
  ): SelectionResult => ({
    unitPriceMicroUsdc: deterministic,
    rationale,
    outcome,
    usedFallback: true,
    rejectedPriceMicroUsdc: rejected,
    latencyMs,
    rawResponse: raw,
    promptHash,
  });

  if (inputs.mode === "off" || inputs.client === null) {
    return fallback("LLM_OFF", 0, null, "");
  }

  const prompt = buildOfferSelectionPrompt(inputs.prompt);
  const promptHash = (inputs.hashPrompt ?? defaultHash)(prompt);

  let raw: string;
  let latencyMs: number;
  try {
    const response = await inputs.client.complete({
      prompt,
      timeoutMs: inputs.timeoutMs,
    });
    raw = response.raw;
    latencyMs = response.latencyMs;
  } catch (error) {
    // ONLY transport failures are absorbed into a fallback. Anything else is a
    // structural problem and must stay loud: a strict replay tape miss, for
    // instance, means the recording no longer matches the engine, and silently
    // degrading it to a deterministic pick would produce a demo that differs
    // from the committed tape without anyone noticing.
    if (!(error instanceof LlmTransportError)) throw error;
    return fallback(
      error.isTimeout ? "TIMEOUT" : "ERROR",
      inputs.timeoutMs,
      null,
      promptHash,
    );
  }

  let parsed;
  try {
    parsed = parseOfferSelectionResponse(raw);
  } catch {
    return fallback("SCHEMA_INVALID", latencyMs, raw, promptHash);
  }

  const sanitised = sanitiseRationale(parsed.rationale);
  const rationale = sanitised.length > 0 ? sanitised : templated;

  // rationale-only mode: take the model's words, never its number.
  if (inputs.mode === "rationale-only") {
    return {
      unitPriceMicroUsdc: deterministic,
      rationale,
      outcome: "ACCEPTED",
      usedFallback: false,
      rejectedPriceMicroUsdc: null,
      latencyMs,
      rawResponse: raw,
      promptHash,
    };
  }

  const requested = BigInt(parsed.unitPriceMicroUsdc);

  if (
    !isWithin(requested, inputs.prompt.bandLoMicroUsdc, inputs.prompt.bandHiMicroUsdc)
  ) {
    // Keep the words, discard the number. The rejected value is recorded so the
    // dashboard can show exactly what arithmetic refused.
    return fallback(
      "OUT_OF_BAND",
      latencyMs,
      raw,
      promptHash,
      requested,
      rationale,
    );
  }

  return {
    unitPriceMicroUsdc: requested,
    rationale,
    outcome: "ACCEPTED",
    usedFallback: false,
    rejectedPriceMicroUsdc: null,
    latencyMs,
    rawResponse: raw,
    promptHash,
  };
}

/** Short prompt fingerprint for the invocation log. Not a security boundary. */
function defaultHash(prompt: string): string {
  return createHash("sha256").update(prompt, "utf8").digest("hex").slice(0, 16);
}
