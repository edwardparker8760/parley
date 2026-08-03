/**
 * Record once, replay forever.
 *
 * ## Why this exists
 *
 * Seeded jitter makes the deterministic engine replay byte for byte. An LLM
 * does not: the same prompt can return different words, different latency, or
 * a 529 on the morning of the recording. A demo video that depends on a live
 * model behaving well on the day is a demo that cannot be re-shot.
 *
 * `ReplayLlmClient` reads a recorded tape keyed by prompt hash and returns the
 * exact bytes the model returned when the tape was cut. It implements the same
 * `LlmClient` interface as the live client, so the bounded selector cannot
 * tell the difference: the outcome branches, the sanitiser, the clamp and the
 * egress guard all run identically. The replayed run is a real run of the
 * whole system, not a rendering of a saved transcript.
 *
 * ## Keying
 *
 * By prompt hash, not by call index. A prompt is a pure function of the
 * negotiation state, so an identical run produces identical prompts and hits
 * every time. If the engine changes such that a prompt differs, the tape MISSES
 * rather than silently returning an answer to a question that was never asked.
 * A miss is loud by design: `strict` mode throws.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import type {
  LlmClient,
  OfferSelectionRawResponse,
  OfferSelectionRequest,
} from "./llm-client-interface.js";
import { LlmTransportError } from "./llm-client-interface.js";

export interface TapeEntry {
  readonly promptHash: string;
  /** Kept for debugging a miss. Not used for lookup. */
  readonly promptPreview: string;
  readonly raw: string;
  readonly latencyMs: number;
}

export interface Tape {
  readonly recordedAt: string;
  readonly model: string;
  readonly entries: readonly TapeEntry[];
}

export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt, "utf8").digest("hex").slice(0, 16);
}

/**
 * Wraps a live client and writes every exchange to a tape.
 * Use once, on a good run, then keep the tape.
 */
export class RecordingLlmClient implements LlmClient {
  readonly name: string;
  readonly #inner: LlmClient;
  readonly #entries: TapeEntry[] = [];
  readonly #model: string;

  constructor(inner: LlmClient, model: string) {
    this.#inner = inner;
    this.#model = model;
    this.name = `recording(${inner.name})`;
  }

  async complete(
    request: OfferSelectionRequest,
  ): Promise<OfferSelectionRawResponse> {
    const response = await this.#inner.complete(request);
    this.#entries.push({
      promptHash: hashPrompt(request.prompt),
      promptPreview: request.prompt.slice(0, 120),
      raw: response.raw,
      latencyMs: response.latencyMs,
    });
    return response;
  }

  writeTape(path: string): Tape {
    const tape: Tape = {
      recordedAt: new Date().toISOString(),
      model: this.#model,
      entries: this.#entries,
    };
    writeFileSync(path, JSON.stringify(tape, null, 2), "utf8");
    return tape;
  }
}

export interface ReplayOptions {
  /**
   * Throw on a tape miss instead of falling through to the deterministic
   * fallback. Default true: a silent miss during a recording session would
   * produce a video that does not match the committed tape.
   */
  readonly strict?: boolean;
  /** Replay the recorded latency. Off by default so replays are fast. */
  readonly simulateLatency?: boolean;
  readonly sleep?: (ms: number) => Promise<void>;
}

export class ReplayLlmClient implements LlmClient {
  readonly name = "replay";
  readonly #byHash: Map<string, TapeEntry>;
  readonly #strict: boolean;
  readonly #simulateLatency: boolean;
  readonly #sleep: (ms: number) => Promise<void>;

  constructor(tape: Tape, options: ReplayOptions = {}) {
    this.#byHash = new Map(tape.entries.map((entry) => [entry.promptHash, entry]));
    this.#strict = options.strict ?? true;
    this.#simulateLatency = options.simulateLatency ?? false;
    this.#sleep =
      options.sleep ??
      ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  static fromFile(path: string, options: ReplayOptions = {}): ReplayLlmClient {
    return new ReplayLlmClient(
      JSON.parse(readFileSync(path, "utf8")) as Tape,
      options,
    );
  }

  get size(): number {
    return this.#byHash.size;
  }

  async complete(
    request: OfferSelectionRequest,
  ): Promise<OfferSelectionRawResponse> {
    const entry = this.#byHash.get(hashPrompt(request.prompt));

    if (entry === undefined) {
      if (this.#strict) {
        throw new Error(
          `Tape miss: no recorded response for this prompt. The negotiation ` +
            `state differs from the recording, so the tape is stale. ` +
            `Re-record, or run with LLM_MODE=off. Prompt began: ` +
            `"${request.prompt.slice(0, 80)}"`,
        );
      }
      // Non-strict: behave like a transport failure so the selector takes its
      // normal fallback branch rather than inventing an answer.
      throw new LlmTransportError("tape miss", false);
    }

    if (this.#simulateLatency && entry.latencyMs > 0) {
      await this.#sleep(entry.latencyMs);
    }

    return { raw: entry.raw, latencyMs: entry.latencyMs, source: "replay" };
  }
}
