/**
 * The phase 06 safety test: NO PAYMENT ON ANY WALK-AWAY PATH.
 *
 * Scenario C is the demo that proves the guardrails bind, and its whole point
 * collapses if a walk-away could still move money. So the adapter here is a
 * counting spy: the assertion is on the number of times settlement was
 * REACHED, not on the transcript that preceded it. An implementation that
 * settled and then rolled back would still fail this test, which is the
 * intent.
 *
 * The companion assertions cover the ACCEPT path: exactly one settlement,
 * the correct amount, a receipt that transitions PENDING to a terminal state,
 * and `isStub` recorded so the SIMULATED badge has something truthful to read.
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { multiplyByQuantity } from "@parley/shared";
import { LocalStubSettlementAdapter } from "@parley/settlement";
import type {
  SettlementAdapter,
  SettlementReceipt,
  SettlementRequest,
} from "@parley/settlement";
import {
  DealRepository,
  PostMortemRepository,
  SettlementReceiptRepository,
} from "@parley/ledger";
import { runScenario } from "./run-negotiation-scenario.js";

/** Wraps a real adapter and counts how many times settlement was reached. */
class CountingSpyAdapter implements SettlementAdapter {
  calls: SettlementRequest[] = [];
  readonly name = "spy";
  readonly isStub = true;
  readonly #inner = new LocalStubSettlementAdapter({ latencyMs: 0 });

  async settle(request: SettlementRequest): Promise<SettlementReceipt> {
    this.calls.push(request);
    return this.#inner.settle(request);
  }
}

test("SCENARIO C: a walk-away never reaches the settlement adapter", async () => {
  const spy = new CountingSpyAdapter();
  const result = await runScenario({ scenario: "C", settlement: spy });

  assert.equal(result.outcome, "WALKED_AWAY");
  assert.equal(spy.calls.length, 0, "settlement was called on a walk-away");
  assert.equal(
    new DealRepository(result.db).findByNegotiation(result.negotiationId),
    undefined,
    "a deal row exists for a negotiation that never converged",
  );
});

test("SCENARIO C: both sides write a post-mortem naming their bound", async () => {
  const result = await runScenario({ scenario: "C" });
  const postmortems = new PostMortemRepository(result.db).listByNegotiation(
    result.negotiationId,
  );

  assert.equal(postmortems.length, 2);
  assert.deepEqual(
    postmortems.map((row) => row.party),
    ["BUYER", "SELLER"],
  );
  for (const row of postmortems) {
    // The oracle knows no price could satisfy both owners in scenario C.
    assert.equal(row.zopaExisted, false);
    assert.ok(row.boundName.length > 0);
    assert.ok(row.explanation.length > 0);
    assert.ok(row.roundsUsed > 0);
  }
});

test("SCENARIO A: exactly one settlement, for the agreed amount", async () => {
  const spy = new CountingSpyAdapter();
  const result = await runScenario({ scenario: "A", settlement: spy });

  assert.equal(result.outcome, "SETTLED");
  assert.equal(spy.calls.length, 1);

  const deal = new DealRepository(result.db).findByNegotiation(
    result.negotiationId,
  );
  assert.ok(deal !== undefined);
  assert.equal(
    deal.amountMicroUsdc,
    multiplyByQuantity(deal.unitPriceMicroUsdc, deal.quantity),
  );

  // The adapter was handed exactly what the ledger recorded, hash included.
  const request = spy.calls[0];
  assert.ok(request !== undefined);
  assert.equal(request.termsHash, deal.termsHash);
  assert.equal(request.agreedOffer.unitPriceMicroUsdc, deal.unitPriceMicroUsdc);
});

test("SCENARIO A: the receipt resolves, records latency, and admits it is a stub", async () => {
  const result = await runScenario({
    scenario: "A",
    settlement: new LocalStubSettlementAdapter({ latencyMs: 0 }),
  });

  const receipt = new SettlementReceiptRepository(result.db).findByDeal(
    result.negotiationId,
  );
  assert.ok(receipt !== undefined);
  assert.equal(receipt.status, "SETTLED_STUB");
  assert.equal(receipt.isStub, true);
  assert.equal(receipt.adapter, "local-stub");
  assert.ok(receipt.reference?.startsWith("0xstub-"));
  assert.equal(receipt.txHash, null);
  assert.ok(receipt.latencyMs !== null && receipt.latencyMs >= 0);
  assert.ok(receipt.settledAt !== null);
});

test("SETTLEMENT FAILURE: marks the receipt FAILED and leaves the transcript intact", async () => {
  const exploding: SettlementAdapter = {
    name: "exploding",
    isStub: true,
    settle: async () => {
      throw new Error("facilitator unreachable");
    },
  };

  const result = await runScenario({ scenario: "A", settlement: exploding });

  // The negotiation still stands: outcome, transcript, and deal row survive.
  assert.equal(result.outcome, "SETTLED");
  assert.ok(result.transcript.length > 0);
  const deal = new DealRepository(result.db).findByNegotiation(
    result.negotiationId,
  );
  assert.ok(deal !== undefined);

  const receipt = new SettlementReceiptRepository(result.db).findByDeal(
    result.negotiationId,
  );
  assert.equal(receipt?.status, "FAILED");
  assert.equal(receipt?.error, "facilitator unreachable");
});
