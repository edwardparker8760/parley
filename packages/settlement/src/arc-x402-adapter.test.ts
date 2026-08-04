/**
 * The real adapter, tested without a funded wallet.
 *
 * Everything here injects a fake `GatewayLike` in place of Circle's client, so
 * these tests run offline and in CI. What they cover is the part that is ours:
 * the precondition, the URL, the terms-hash binding, the amount check, and the
 * refusal to ever call something a settlement when it is not.
 *
 * What they deliberately do NOT cover is Circle's behaviour. That cannot be
 * faked into evidence: it has to be measured live, and it is, in
 * docs/settlement-latency.md.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { ArcX402SettlementAdapter } from "./arc-x402-settlement-adapter.js";
import type { GatewayLike } from "./arc-x402-settlement-adapter.js";
import { SettlementNotConfiguredError } from "./settlement-adapter-interface.js";
import type { SettlementRequest } from "./settlement-adapter-interface.js";
import {
  microUsdcToDecimalString,
  microUsdcToPriceString,
} from "./micro-usdc-to-price-string.js";

const KEY = `0x${"1".repeat(64)}` as const;

const REQUEST: SettlementRequest = {
  dealId: "deal-1",
  agreedOffer: {
    unitPriceMicroUsdc: 984n,
    quantity: 10_000,
    terms: { deliveryWindowHours: 24, slaTier: "standard" },
  },
  termsHash: "0xabc123",
  buyerAddress: "0xbuyer",
  sellerAddress: "0xseller",
};

/** 984 * 10000 = 9_840_000 micro-USDC, which is 9.84 USDC. */
const EXPECTED_ATOMIC = 9_840_000n;

interface Recorded {
  supportsUrl: string | null;
  payUrl: string | null;
  payBody: unknown;
}

function fakeGateway(
  overrides: {
    supported?: boolean;
    amount?: bigint;
    transaction?: string;
    payThrows?: Error;
  } = {},
): { gateway: GatewayLike; recorded: Recorded } {
  const recorded: Recorded = { supportsUrl: null, payUrl: null, payBody: null };
  const gateway: GatewayLike = {
    async supports(url) {
      recorded.supportsUrl = url;
      return { supported: overrides.supported ?? true };
    },
    async pay<T>(url: string, options?: { body?: unknown }) {
      recorded.payUrl = url;
      recorded.payBody = options?.body;
      if (overrides.payThrows !== undefined) throw overrides.payThrows;
      return {
        amount: overrides.amount ?? EXPECTED_ATOMIC,
        transaction: overrides.transaction ?? "0xtx-real",
        status: 200,
        data: { grant: "bulk-inference-capacity" } as T,
      };
    },
    async searchTransfers() {
      return { data: [] };
    },
    async getTransferById(id) {
      return { id, status: "received" };
    },
  };
  return { gateway, recorded };
}

function buildAdapter(gateway: GatewayLike): ArcX402SettlementAdapter {
  return new ArcX402SettlementAdapter({
    buyerPrivateKey: KEY,
    sellerAddress: "0xseller",
    chain: "arcTestnet",
    network: "eip155:5042002",
    facilitatorUrl: "https://gateway-api-testnet.circle.com",
    sellerServiceUrl: "http://127.0.0.1:4021",
    client: gateway,
  });
}

test("micro-USDC converts to a dollar string exactly, with no float anywhere", () => {
  assert.equal(microUsdcToDecimalString(9_840_000n), "9.840000");
  assert.equal(microUsdcToPriceString(9_840_000n), "$9.840000");
  assert.equal(microUsdcToDecimalString(1n), "0.000001");
  assert.equal(microUsdcToDecimalString(0n), "0.000000");
  // The value that breaks naive float division: 0.1 + 0.2 territory.
  assert.equal(microUsdcToDecimalString(300_000n), "0.300000");
  assert.throws(() => microUsdcToDecimalString(-1n), /cannot be negative/);
});

test("settle pays the deal's own URL and binds the payment to the terms hash", async () => {
  const { gateway, recorded } = fakeGateway();
  const receipt = await buildAdapter(gateway).settle(REQUEST);

  assert.equal(recorded.supportsUrl, "http://127.0.0.1:4021/deals/deal-1/capacity");
  assert.equal(recorded.payUrl, "http://127.0.0.1:4021/deals/deal-1/capacity");
  assert.deepEqual(recorded.payBody, { termsHash: "0xabc123" });

  assert.equal(receipt.amountMicroUsdc, EXPECTED_ATOMIC);
  assert.equal(receipt.termsHash, "0xabc123");
  assert.equal(receipt.isStub, false);
  assert.equal(receipt.txHash, "0xtx-real");
});

test("a real settlement is PENDING, not SETTLED: Circle batches and cannot be flushed", async () => {
  const { gateway } = fakeGateway();
  const receipt = await buildAdapter(gateway).settle(REQUEST);

  // This is the honesty control. An authorization has been accepted; the batch
  // has not necessarily landed. Reporting SETTLED here would be a claim about
  // Circle's schedule that this code cannot make.
  assert.equal(receipt.status, "PENDING");
  assert.notEqual(receipt.status, "SETTLED");
});

test("a seller that does not offer Gateway batching fails loudly", async () => {
  const { gateway } = fakeGateway({ supported: false });
  await assert.rejects(
    () => buildAdapter(gateway).settle(REQUEST),
    (error: unknown) => {
      assert.ok(error instanceof SettlementNotConfiguredError);
      assert.match((error as Error).message, /does not offer Gateway batching/);
      return true;
    },
  );
});

test("paying a different amount than the deal is refused, not recorded", async () => {
  const { gateway } = fakeGateway({ amount: 1n });
  await assert.rejects(
    () => buildAdapter(gateway).settle(REQUEST),
    /refusing to record this as settlement/,
  );
});

test("a transport failure propagates and never downgrades to the stub", async () => {
  const { gateway } = fakeGateway({ payThrows: new Error("facilitator down") });
  const adapter = buildAdapter(gateway);

  await assert.rejects(() => adapter.settle(REQUEST), /facilitator down/);
  // The adapter still says it is not a stub. Nothing about a failure may make
  // a real adapter start producing simulated receipts.
  assert.equal(adapter.isStub, false);
  assert.equal(adapter.name, "arc-x402");
});

test("the adapter refuses to exist without somewhere to pay", () => {
  assert.throws(
    () =>
      new ArcX402SettlementAdapter({
        buyerPrivateKey: KEY,
        sellerAddress: "0xseller",
        chain: "arcTestnet",
        network: "eip155:5042002",
        facilitatorUrl: "https://gateway-api-testnet.circle.com",
        sellerServiceUrl: "",
      }),
    /sellerServiceUrl is empty/,
  );
});

test("waitForSettlement reports what it observed, including a timeout", async () => {
  const { gateway } = fakeGateway();
  const adapter = buildAdapter(gateway);

  // No transfers come back, so the wait must expire and SAY it expired rather
  // than returning a settled-looking answer.
  const outcome = await adapter.waitForSettlement({
    fromAddress: "0xbuyer",
    timeoutMs: 10,
    pollIntervalMs: 1,
  });
  assert.equal(outcome.status, "unknown");
  assert.equal(outcome.transferId, null);
  assert.ok(outcome.waitedMs >= 10);
});
