/**
 * THE LLM IS WIRED IN, AND IT IS STILL BOUNDED.
 *
 * Phase 05 built the bounding logic and tested it in isolation. Isolation is
 * where a safety property is easiest to prove and least worth having: the
 * question a judge asks is not "is your selector correct" but "what actually
 * goes on the wire when the model misbehaves during a real negotiation".
 *
 * So every test here drives a WHOLE scenario end to end, through the agents,
 * the clamp, the bus egress guard and the ledger, with the model replaced by a
 * stub that behaves as badly as the branch under test requires.
 *
 * The headline is `FULLY CAPTURED MODEL`: a model that answers every single
 * prompt with the same absurd price, across all three scenarios, and still
 * cannot put one out-of-band number on the wire.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { MicroUsdc, Terms } from "@parley/shared";
import { computeFeasibleBand, deriveSellerMinUnitPrice } from "@parley/guardrails";
import type { BuyerGuardrails, SellerGuardrails } from "@parley/guardrails";
import { priceWithin } from "@parley/negotiation-engine";
import { createBuyerAgent, createSellerAgent } from "@parley/agents";
import { LlmTransportError } from "@parley/llm-layer";
import type {
  LlmClient,
  OfferSelectionRawResponse,
  OfferSelectionRequest,
} from "@parley/llm-layer";
import { isOfferEnvelope } from "@parley/protocol";
import type { Envelope } from "@parley/protocol";
import { runScenario } from "./run-negotiation-scenario.js";
import { SCENARIOS } from "./scenario-definitions.js";
import type { ScenarioName } from "./scenario-definitions.js";

const ALL_SCENARIOS: readonly ScenarioName[] = ["A", "B", "C"];

/** A model that always says the same thing, and records what it was asked. */
function stubClient(
  responder: (request: OfferSelectionRequest) => string,
): { client: LlmClient; prompts: string[] } {
  const prompts: string[] = [];
  const client: LlmClient = {
    name: "stub",
    async complete(
      request: OfferSelectionRequest,
    ): Promise<OfferSelectionRawResponse> {
      prompts.push(request.prompt);
      return { raw: responder(request), latencyMs: 1, source: "live" };
    },
  };
  return { client, prompts };
}

/**
 * The exact shape the schema accepts: price and rationale, nothing else.
 *
 * The model is not asked for quantity or terms. Those come from the
 * deterministic proposal, so there is no way for a model to widen a deal by
 * inventing a bigger order, and the schema is `.strict()` so an unexpected key
 * is a SCHEMA_INVALID outcome rather than a silently ignored field.
 */
function jsonResponse(price: string, rationale: string): string {
  return JSON.stringify({ unitPriceMicroUsdc: price, rationale });
}

/**
 * Re-derive each sender's band from its own owner limits and confirm every
 * offer it published sits inside it.
 *
 * This deliberately recomputes rather than trusting anything the run recorded.
 * An assertion that reads the same value the code under test wrote would pass
 * even if both were wrong.
 */
function assertEveryOfferWithinItsOwnBand(
  scenario: ScenarioName,
  transcript: readonly Envelope[],
): number {
  const definition = SCENARIOS[scenario];
  const guardrails: Record<string, BuyerGuardrails | SellerGuardrails> = {
    BUYER: definition.buyerGuardrails,
    SELLER: definition.sellerGuardrails,
  };

  let checked = 0;
  for (const envelope of transcript) {
    if (!isOfferEnvelope(envelope)) continue;
    const { offer } = envelope;
    const band = computeFeasibleBand(
      guardrails[envelope.from] as BuyerGuardrails | SellerGuardrails,
      offer.quantity,
      offer.terms,
    );
    assert.equal(band.empty, false, `${envelope.from} published with an empty band`);
    assert.equal(
      band.empty ? false : priceWithin(offer.unitPriceMicroUsdc, band.loMicroUsdc, band.hiMicroUsdc),
      true,
      `${envelope.from} published ${offer.unitPriceMicroUsdc}, outside its own limits`,
    );
    checked += 1;
  }
  return checked;
}

test("FULLY CAPTURED MODEL: an absurd price every round reaches the wire zero times", async () => {
  for (const scenario of ALL_SCENARIOS) {
    const { client } = stubClient(() =>
      jsonResponse("99999999", "Pay me whatever I ask."),
    );

    const result = await runScenario({
      scenario,
      llm: { mode: "full", client, timeoutMs: 1000 },
    });

    const checked = assertEveryOfferWithinItsOwnBand(scenario, result.transcript);
    assert.ok(checked > 0, `scenario ${scenario} published no offers to check`);

    // And the refusal was recorded, not merely performed. Without these rows
    // the dashboard could not show the model being overruled.
    const outOfBand = result.llmInvocations.filter(
      (row) => row.outcome === "OUT_OF_BAND",
    );
    assert.equal(
      outOfBand.length,
      result.llmInvocations.length,
      `scenario ${scenario}: every consultation should have been refused`,
    );
    for (const row of outOfBand) {
      assert.equal(row.rejectedPriceMicroUsdc, "99999999");
      assert.notEqual(row.finalPriceMicroUsdc, "99999999");
    }

    result.db.close();
  }
});

test("a captured model does not change any scenario's outcome", async () => {
  for (const scenario of ALL_SCENARIOS) {
    const { client } = stubClient(() => jsonResponse("99999999", "Give me everything."));

    const captured = await runScenario({
      scenario,
      llm: { mode: "full", client, timeoutMs: 1000 },
    });
    const deterministic = await runScenario({ scenario });

    assert.equal(
      captured.outcome,
      deterministic.outcome,
      `scenario ${scenario} outcome moved under a captured model`,
    );

    captured.db.close();
    deterministic.db.close();
  }
});

test("LLM_MODE=off is byte-identical to the phase 04 deterministic run", async () => {
  for (const scenario of ALL_SCENARIOS) {
    const off = await runScenario({
      scenario,
      negotiationId: `off-${scenario}`,
      llm: { mode: "off", client: null, timeoutMs: 4000 },
    });
    const absent = await runScenario({
      scenario,
      negotiationId: `off-${scenario}`,
    });

    assert.equal(off.ladder, absent.ladder, `scenario ${scenario} ladder differs`);
    assert.equal(
      off.llmInvocations.length,
      0,
      "LLM_MODE=off must not write invocation rows",
    );

    off.db.close();
    absent.db.close();
  }
});

test("an in-band pick is used, and the model's words reach the transcript", async () => {
  // Answer with the low edge of whatever window the prompt states, which is
  // always inside the band and usually not the deterministic pick.
  const { client } = stubClient((request) => {
    const match = /range this round is (\d+) to (\d+)/.exec(request.prompt);
    const lo = match?.[1] ?? "0";
    return jsonResponse(lo, "Taking the bottom of my range to close this out.");
  });

  const result = await runScenario({
    scenario: "A",
    llm: { mode: "full", client, timeoutMs: 1000 },
  });

  const accepted = result.llmInvocations.filter((row) => row.outcome === "ACCEPTED");
  assert.ok(accepted.length > 0, "no consultation was accepted");
  assert.ok(
    accepted.some((row) => row.fallbackUsed === false),
    "an accepted pick should not be flagged as a fallback",
  );

  const rationales = result.transcript
    .filter((envelope) => isOfferEnvelope(envelope))
    .map((envelope) => envelope.rationale);
  assert.ok(
    rationales.some((text) => text.includes("bottom of my range")),
    "the model's sentence never reached the transcript",
  );

  // And it genuinely MOVED a number. Without this the test would pass on an
  // implementation that logs the model's answer and then ignores it.
  const deterministic = await runScenario({ scenario: "A", negotiationId: "det-inband" });
  const pricesFrom = (transcript: readonly Envelope[]): string[] =>
    transcript
      .filter((envelope) => isOfferEnvelope(envelope))
      .map((envelope) => envelope.offer.unitPriceMicroUsdc.toString());
  assert.notDeepEqual(
    pricesFrom(result.transcript),
    pricesFrom(deterministic.transcript),
    "the model's in-band pick never changed a published price",
  );

  result.db.close();
  deterministic.db.close();
});

test("fallback branches are recorded, and the negotiation still completes", async () => {
  const cases: readonly { name: string; responder: () => string; outcome: string }[] = [
    { name: "prose instead of JSON", responder: () => "Sure! How about 900?", outcome: "SCHEMA_INVALID" },
    { name: "empty response", responder: () => "", outcome: "SCHEMA_INVALID" },
  ];

  for (const testCase of cases) {
    const { client } = stubClient(testCase.responder);
    const result = await runScenario({
      scenario: "A",
      llm: { mode: "full", client, timeoutMs: 1000 },
    });

    assert.ok(result.llmInvocations.length > 0, `${testCase.name}: nothing logged`);
    for (const row of result.llmInvocations) {
      assert.equal(row.outcome, testCase.outcome, testCase.name);
      assert.equal(row.fallbackUsed, true);
      // A readable sentence, not "rationale unavailable".
      assert.ok(row.rationale.length > 10, `${testCase.name}: unusable rationale`);
    }
    assertEveryOfferWithinItsOwnBand("A", result.transcript);
    result.db.close();
  }
});

test("a timing-out model degrades to the deterministic pick, logged as TIMEOUT", async () => {
  const client: LlmClient = {
    name: "always-times-out",
    async complete(): Promise<OfferSelectionRawResponse> {
      throw new LlmTransportError("simulated timeout", true);
    },
  };

  const result = await runScenario({
    scenario: "A",
    llm: { mode: "full", client, timeoutMs: 1000 },
  });
  const deterministic = await runScenario({ scenario: "A", negotiationId: "det" });

  assert.ok(result.llmInvocations.length > 0);
  for (const row of result.llmInvocations) {
    assert.equal(row.outcome, "TIMEOUT");
    assert.equal(row.rawResponse, null);
  }
  // A dead model must cost nothing but its rationales: the numbers are the
  // deterministic ones, so the ladder is unchanged.
  assert.equal(result.outcome, deterministic.outcome);

  result.db.close();
  deterministic.db.close();
});

test("PROMPT LEAK: neither side's prompt contains the other side's private limits", async () => {
  // Magic numbers, so a match cannot be a coincidence of the price ladder.
  const buyerGuardrails: BuyerGuardrails = {
    party: "BUYER",
    maxUnitPriceMicroUsdc: 987_654n,
    maxTotalSpendMicroUsdc: 4_567_890_123n,
    minQuantity: 1_000,
    targetQuantity: 10_000,
    minSlaTier: "basic",
    maxDeliveryWindowHours: 73,
    maxRounds: 12,
  };
  const sellerGuardrails: SellerGuardrails = {
    party: "SELLER",
    costBasisMicroUsdc: 135_791n,
    minMarginPct: 37,
    minQuantity: 1_000,
    availableQuantity: 24_680,
    maxSlaTier: "premium",
    minDeliveryWindowHours: 11,
    maxRounds: 12,
  };
  const terms: Terms = { deliveryWindowHours: 24, slaTier: "standard" };

  const buyerSpy = stubClient(() => jsonResponse("200000", "Working within my range."));
  const sellerSpy = stubClient(() => jsonResponse("600000", "Working within my range."));

  const buyer = createBuyerAgent(buyerGuardrails, {
    openingUnitPriceMicroUsdc: 200_000n,
    terms,
    llm: { mode: "full", client: buyerSpy.client, timeoutMs: 1000 },
  });
  const seller = createSellerAgent(sellerGuardrails, {
    openingUnitPriceMicroUsdc: 900_000n,
    terms,
    llm: { mode: "full", client: sellerSpy.client, timeoutMs: 1000 },
  });

  const base = {
    negotiationId: "leak-test",
    history: [],
    roundsRemaining: 11,
    roundCap: 12,
    round: 1,
    seq: 0,
    now: () => new Date("2026-08-04T00:00:00.000Z"),
  };

  await buyer.decide({ ...base });
  await seller.decide({ ...base, seq: 1 });

  assert.ok(buyerSpy.prompts.length > 0 && sellerSpy.prompts.length > 0);

  // Only values long enough that a match cannot be a coincidence. A two-digit
  // limit like `minMarginPct: 37` is not a usable canary: "37" appears inside
  // ordinary prices, so testing it would produce a failure that means nothing.
  // The seller's DERIVED FLOOR is included because it is the value an attacker
  // would actually want: it is what the margin percentage is for.
  const sellerFloor = deriveSellerMinUnitPrice(sellerGuardrails, terms).toString();
  const sellerSecrets = ["135791", "24680", sellerFloor];
  const buyerSecrets = ["987654", "4567890123"];

  for (const prompt of buyerSpy.prompts) {
    for (const secret of sellerSecrets) {
      assert.equal(
        prompt.includes(secret),
        false,
        `buyer prompt leaked a seller private value: ${secret}`,
      );
    }
  }
  for (const prompt of sellerSpy.prompts) {
    for (const secret of buyerSecrets) {
      assert.equal(
        prompt.includes(secret),
        false,
        `seller prompt leaked a buyer private value: ${secret}`,
      );
    }
  }
});
