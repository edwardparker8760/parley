/**
 * Record/replay fidelity, and the five bounding branches.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { selectOfferWithBoundedLlm } from "./bounded-offer-selector.js";
import type { SelectorInputs } from "./bounded-offer-selector.js";
import {
  RecordingLlmClient,
  ReplayLlmClient,
} from "./recording-and-replay-client.js";
import type { LlmClient, OfferSelectionRawResponse } from "./llm-client-interface.js";
import { LlmTransportError } from "./llm-client-interface.js";
import { sanitiseRationale } from "./rationale-sanitiser.js";

function fixedClient(raw: string, latencyMs = 5): LlmClient {
  return {
    name: "fixed",
    async complete(): Promise<OfferSelectionRawResponse> {
      return { raw, latencyMs, source: "live" };
    },
  };
}

function throwingClient(error: Error): LlmClient {
  return {
    name: "throwing",
    async complete(): Promise<OfferSelectionRawResponse> {
      throw error;
    },
  };
}

const BASE: Omit<SelectorInputs, "client" | "mode"> = {
  timeoutMs: 1000,
  prompt: {
    party: "BUYER",
    bandLoMicroUsdc: 0n,
    bandHiMicroUsdc: 900n,
    deterministicPickMicroUsdc: 700n,
    round: 4,
    roundCap: 12,
    ownLastOfferMicroUsdc: 650n,
    counterpartyLastOfferMicroUsdc: 1200n,
    counterpartyRationale: "We have costs to cover.",
    quantity: 10_000,
  },
  template: {
    situation: "CONCEDING",
    priceMicroUsdc: 700n,
    previousPriceMicroUsdc: 650n,
    counterpartyPriceMicroUsdc: 1200n,
    roundsRemaining: 8,
  },
};

test("BOUNDING: in-band pick is accepted", async () => {
  const result = await selectOfferWithBoundedLlm({
    ...BASE,
    mode: "full",
    client: fixedClient(
      JSON.stringify({ unitPriceMicroUsdc: "820", rationale: "Meeting nearer the middle." }),
    ),
  });
  assert.equal(result.outcome, "ACCEPTED");
  assert.equal(result.unitPriceMicroUsdc, 820n);
  assert.equal(result.usedFallback, false);
});

test("BOUNDING: one micro-unit past the ceiling is rejected", async () => {
  const result = await selectOfferWithBoundedLlm({
    ...BASE,
    mode: "full",
    client: fixedClient(
      JSON.stringify({ unitPriceMicroUsdc: "901", rationale: "Just a little more." }),
    ),
  });
  assert.equal(result.outcome, "OUT_OF_BAND");
  assert.equal(result.rejectedPriceMicroUsdc, 901n);
  assert.equal(result.unitPriceMicroUsdc, 700n);
  // The words survive even though the number did not: this is the demo moment.
  assert.match(result.rationale, /little more/);
});

test("BOUNDING: malformed JSON, wrong schema, and empty response all fall back", async () => {
  for (const raw of [
    "not json at all",
    JSON.stringify({ price: "820" }),
    JSON.stringify({ unitPriceMicroUsdc: 820, rationale: "number not string" }),
    JSON.stringify({ unitPriceMicroUsdc: "820", rationale: "x", extra: true }),
    "",
  ]) {
    const result = await selectOfferWithBoundedLlm({
      ...BASE,
      mode: "full",
      client: fixedClient(raw),
    });
    assert.equal(result.outcome, "SCHEMA_INVALID", `raw: ${raw.slice(0, 30)}`);
    assert.equal(result.unitPriceMicroUsdc, 700n);
    assert.ok(result.rationale.length > 0, "fallback rationale must be readable");
  }
});

test("BOUNDING: timeout and transport error are distinguished", async () => {
  const timedOut = await selectOfferWithBoundedLlm({
    ...BASE,
    mode: "full",
    client: throwingClient(new LlmTransportError("aborted", true)),
  });
  assert.equal(timedOut.outcome, "TIMEOUT");
  assert.equal(timedOut.unitPriceMicroUsdc, 700n);

  const errored = await selectOfferWithBoundedLlm({
    ...BASE,
    mode: "full",
    client: throwingClient(new LlmTransportError("ECONNRESET", false)),
  });
  assert.equal(errored.outcome, "ERROR");
  assert.equal(errored.unitPriceMicroUsdc, 700n);
});

test("BOUNDING: rationale-only takes the words and never the number", async () => {
  const result = await selectOfferWithBoundedLlm({
    ...BASE,
    mode: "rationale-only",
    client: fixedClient(
      JSON.stringify({ unitPriceMicroUsdc: "500", rationale: "I want a much better price." }),
    ),
  });
  assert.equal(result.outcome, "ACCEPTED");
  assert.equal(result.unitPriceMicroUsdc, 700n, "number must be deterministic");
  assert.match(result.rationale, /better price/);
});

test("BOUNDING: off mode never calls the client", async () => {
  let called = false;
  const spy: LlmClient = {
    name: "spy",
    async complete(): Promise<OfferSelectionRawResponse> {
      called = true;
      return { raw: "{}", latencyMs: 0, source: "live" };
    },
  };
  const result = await selectOfferWithBoundedLlm({ ...BASE, mode: "off", client: spy });
  assert.equal(called, false);
  assert.equal(result.outcome, "LLM_OFF");
  assert.ok(result.rationale.length > 0);
});

test("REPLAY: a recorded tape reproduces the live result exactly", async () => {
  const directory = mkdtempSync(join(tmpdir(), "parley-tape-"));
  const tapePath = join(directory, "tape.json");

  try {
    // 1. Record a run against a "live" client.
    const recorder = new RecordingLlmClient(
      fixedClient(
        JSON.stringify({ unitPriceMicroUsdc: "835", rationale: "Splitting the difference." }),
        1234,
      ),
      "test-model",
    );
    const live = await selectOfferWithBoundedLlm({
      ...BASE,
      mode: "full",
      client: recorder,
    });
    recorder.writeTape(tapePath);

    // 2. Replay from the tape alone.
    const replay = ReplayLlmClient.fromFile(tapePath);
    assert.equal(replay.size, 1);
    const replayed = await selectOfferWithBoundedLlm({
      ...BASE,
      mode: "full",
      client: replay,
    });

    // Byte-identical on every field the transcript depends on.
    assert.equal(replayed.unitPriceMicroUsdc, live.unitPriceMicroUsdc);
    assert.equal(replayed.rationale, live.rationale);
    assert.equal(replayed.outcome, live.outcome);
    assert.equal(replayed.rawResponse, live.rawResponse);
    assert.equal(replayed.promptHash, live.promptHash);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("REPLAY: a stale tape fails loudly rather than inventing an answer", async () => {
  const directory = mkdtempSync(join(tmpdir(), "parley-tape-"));
  const tapePath = join(directory, "tape.json");

  try {
    const recorder = new RecordingLlmClient(
      fixedClient(JSON.stringify({ unitPriceMicroUsdc: "835", rationale: "ok" })),
      "test-model",
    );
    await selectOfferWithBoundedLlm({ ...BASE, mode: "full", client: recorder });
    recorder.writeTape(tapePath);

    // Change the negotiation state, so the prompt (and its hash) differs.
    const replay = ReplayLlmClient.fromFile(tapePath, { strict: true });
    await assert.rejects(
      () =>
        selectOfferWithBoundedLlm({
          ...BASE,
          mode: "full",
          client: replay,
          prompt: { ...BASE.prompt, round: 9 },
        }),
      /Tape miss/,
      "a stale tape must not silently answer a question it never saw",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("SANITISER: hostile rationale text is defanged before storage", () => {
  assert.equal(sanitiseRationale("line1\nline2\ttab"), "line1 line2 tab");
  assert.equal(sanitiseRationale("```json\nhello\n```"), "json hello");
  assert.ok(!sanitiseRationale("a`b`c").includes("`"));
  assert.ok(sanitiseRationale("x".repeat(400)).length <= 240);
  // A decimal point must not be treated as a sentence end.
  const decimal = sanitiseRationale(
    "I am moving my offer up to 0.00085 per call because time is short.",
  );
  assert.match(decimal, /0\.00085/);
});
