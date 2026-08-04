/**
 * The paywall refuses what it should refuse.
 *
 * Runs the real Express app against a real (temporary) ledger on an ephemeral
 * port. No wallet and no facilitator call is needed for these cases, because
 * every one of them is a refusal that happens BEFORE any payment is quoted.
 *
 * The case that needs a funded wallet, a successful 402-to-200 with money
 * moving, cannot be asserted here and is not faked. It is measured live and
 * recorded in docs/settlement-latency.md.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import { DealRepository } from "@parley/ledger";
import { createCapacityPaywallApp } from "./create-capacity-paywall-app.js";

const SELLER = "0x4Fc4cec3b6F29Fe2d7a50101BFa5737715ce6bCB";

interface Harness {
  readonly baseUrl: string;
  readonly dealId: string;
  readonly termsHash: string;
  close(): Promise<void>;
}

async function startHarness(): Promise<Harness> {
  const directory = mkdtempSync(join(tmpdir(), "parley-paywall-"));
  const ledgerPath = join(directory, "ledger.db");

  const { app, db } = createCapacityPaywallApp({
    sellerAddress: SELLER,
    ledgerPath,
  });

  // A deal has to exist before it can be paid for, and it has to come from a
  // negotiation: the foreign key is the point, not an inconvenience.
  db.prepare(
    `INSERT INTO negotiations (id, scenario, status, round_cap, started_at)
     VALUES ('n-1', 'A', 'SETTLED', 12, '2026-08-04T00:00:00.000Z')`,
  ).run();

  const deal = new DealRepository(db).create({
    id: "deal-n-1",
    negotiationId: "n-1",
    acceptedSeq: 17,
    agreedOffer: {
      unitPriceMicroUsdc: 984n,
      quantity: 10_000,
      terms: { deliveryWindowHours: 24, slaTier: "standard" },
    },
    amountMicroUsdc: 9_840_000n,
    termsHash: "0xdeadbeef",
    createdAt: "2026-08-04T00:00:00.000Z",
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    dealId: deal.id,
    termsHash: deal.termsHash,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("the seller quotes the deal's own amount, not the buyer's", async () => {
  const harness = await startHarness();
  try {
    const response = await fetch(`${harness.baseUrl}/deals/${harness.dealId}/quote`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as Record<string, unknown>;

    // 984 micro-USDC per call times 10,000 calls.
    assert.equal(body["amountMicroUsdc"], "9840000");
    assert.equal(body["price"], "$9.840000");
    assert.equal(body["termsHash"], "0xdeadbeef");
  } finally {
    await harness.close();
  }
});

test("an unknown deal is 404, never a free grant", async () => {
  const harness = await startHarness();
  try {
    const response = await fetch(`${harness.baseUrl}/deals/no-such-deal/capacity`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ termsHash: "0xdeadbeef" }),
    });
    assert.equal(response.status, 404);
  } finally {
    await harness.close();
  }
});

test("a wrong terms hash is refused BEFORE a price is quoted", async () => {
  const harness = await startHarness();
  try {
    const response = await fetch(
      `${harness.baseUrl}/deals/${harness.dealId}/capacity`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ termsHash: "0xnot-the-agreed-terms" }),
      },
    );

    // 409, not 402. A payment bound to terms nobody agreed to would look
    // legitimate in the ledger afterwards, which is worse than no payment.
    assert.equal(response.status, 409);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body["expected"], "0xdeadbeef");
  } finally {
    await harness.close();
  }
});

test("a correct request with no payment gets 402, not the capacity grant", async () => {
  const harness = await startHarness();
  try {
    const response = await fetch(
      `${harness.baseUrl}/deals/${harness.dealId}/capacity`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ termsHash: harness.termsHash }),
      },
    );

    assert.equal(response.status, 402, "an unpaid request must not be served");
    const body = (await response.text()).toLowerCase();
    assert.equal(
      body.includes("bulk-inference-capacity") && body.includes("grant"),
      false,
      "the paid resource leaked into the 402 challenge",
    );
  } finally {
    await harness.close();
  }
});
