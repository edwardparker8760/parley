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
  quoteUrl: string | null;
  payUrl: string | null;
  payBody: unknown;
}

/**
 * Stands in for the seller's unpriced quote route, which is the adapter's
 * precondition. `quotedAmount: null` means the seller is not reachable.
 */
function fakeQuote(
  recorded: Recorded,
  quotedAmount: bigint | null,
): typeof globalThis.fetch {
  return (async (input: string | URL | Request) => {
    recorded.quoteUrl = String(input);
    if (quotedAmount === null) throw new Error("connection refused");
    return {
      ok: true,
      async json() {
        return { amountMicroUsdc: quotedAmount.toString() };
      },
    } as Response;
  }) as typeof globalThis.fetch;
}

function fakeGateway(
  overrides: {
    amount?: bigint;
    transaction?: string;
    payThrows?: Error;
  } = {},
): { gateway: GatewayLike; recorded: Recorded } {
  const recorded: Recorded = { quoteUrl: null, payUrl: null, payBody: null };
  const gateway: GatewayLike = {
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
    async getTransferById(id) {
      // Circle's pre-batch shape: authorised, no on-chain hash yet.
      return { id, status: "received", txHash: null };
    },
  };
  return { gateway, recorded };
}

function buildAdapter(
  gateway: GatewayLike,
  recorded: Recorded,
  quotedAmount: bigint | null = EXPECTED_ATOMIC,
): ArcX402SettlementAdapter {
  return new ArcX402SettlementAdapter({
    buyerPrivateKey: KEY,
    sellerAddress: "0xseller",
    chain: "arcTestnet",
    network: "eip155:5042002",
    facilitatorUrl: "https://gateway-api-testnet.circle.com",
    sellerServiceUrl: "http://127.0.0.1:4021",
    client: gateway,
    fetchImpl: fakeQuote(recorded, quotedAmount),
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
  const receipt = await buildAdapter(gateway, recorded).settle(REQUEST);

  assert.equal(recorded.quoteUrl, "http://127.0.0.1:4021/deals/deal-1/quote");
  assert.equal(recorded.payUrl, "http://127.0.0.1:4021/deals/deal-1/capacity");
  assert.deepEqual(recorded.payBody, { termsHash: "0xabc123" });

  assert.equal(receipt.amountMicroUsdc, EXPECTED_ATOMIC);
  assert.equal(receipt.termsHash, "0xabc123");
  assert.equal(receipt.isStub, false);

  // The SDK's `transaction` is Circle's transfer id, so it is the REFERENCE.
  assert.equal(receipt.reference, "0xtx-real");

  /*
   * And it is NOT the transaction hash. Recording it as one produced an
   * explorer URL of the form `.../tx/<uuid>`, which arcscan answers 200 for
   * because it is a single page app: a link that looks like proof of an
   * on-chain transaction and is not one. Observed on the real 2026-08-06 run,
   * where Circle's own transfer record carried `txHash: null` for the same id.
   * There is no hash until the batch lands, so there must be none here.
   */
  assert.equal(receipt.txHash, undefined);
});

test("a real settlement is PENDING, not SETTLED: Circle batches and cannot be flushed", async () => {
  const { gateway, recorded } = fakeGateway();
  const receipt = await buildAdapter(gateway, recorded).settle(REQUEST);

  // This is the honesty control. An authorization has been accepted; the batch
  // has not necessarily landed. Reporting SETTLED here would be a claim about
  // Circle's schedule that this code cannot make.
  assert.equal(receipt.status, "PENDING");
  assert.notEqual(receipt.status, "SETTLED");
});

test("a seller that cannot be reached fails loudly, before any signature", async () => {
  const { gateway, recorded } = fakeGateway();
  await assert.rejects(
    () => buildAdapter(gateway, recorded, null).settle(REQUEST),
    (error: unknown) => {
      assert.ok(error instanceof SettlementNotConfiguredError);
      assert.match((error as Error).message, /did not answer with a quote/);
      return true;
    },
  );
  assert.equal(recorded.payUrl, null, "nothing may be paid when the quote failed");
});

/*
 * The precondition is the seller's quote rather than `GatewayClient.supports()`
 * because supports() probes the paid route with no body, and the paid route
 * answers 409 to a request carrying no terms hash, before it will quote a
 * price. Measured against the live service on 2026-08-06: bare probe 409,
 * probe with the correct hash 402. The old check called a working seller
 * broken. This one also catches a price disagreement BEFORE a signature.
 */
test("a seller that quotes a different amount is refused before signing", async () => {
  const { gateway, recorded } = fakeGateway();
  await assert.rejects(
    () => buildAdapter(gateway, recorded, 1n).settle(REQUEST),
    /Refusing to sign a payment for a different deal/,
  );
  assert.equal(recorded.payUrl, null, "a disputed price must never be signed for");
});

test("paying a different amount than the deal is refused, not recorded", async () => {
  const { gateway, recorded } = fakeGateway({ amount: 1n });
  await assert.rejects(
    () => buildAdapter(gateway, recorded).settle(REQUEST),
    /refusing to record this as settlement/,
  );
});

test("a transport failure propagates and never downgrades to the stub", async () => {
  const { gateway, recorded } = fakeGateway({ payThrows: new Error("facilitator down") });
  const adapter = buildAdapter(gateway, recorded);

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
  const { gateway, recorded } = fakeGateway();
  const adapter = buildAdapter(gateway, recorded);

  // The transfer stays `received`, so the wait must expire and SAY it expired,
  // reporting the last status it actually saw rather than a settled-looking
  // answer. A null txHash on a timeout is the truthful result: no batch landed.
  const outcome = await adapter.waitForSettlement({
    transferId: "cad9fe1e-7201-40d0-b4d9-ce6a7c3655d4",
    timeoutMs: 10,
    pollIntervalMs: 1,
  });
  assert.equal(outcome.status, "received");
  assert.equal(outcome.txHash, null);
  assert.ok(outcome.waitedMs >= 10);
});

test("waitForSettlement surfaces the real on-chain hash once the batch lands", async () => {
  const { gateway, recorded } = fakeGateway();
  const adapter = buildAdapter(gateway, recorded);

  /*
   * The values are the real ones from the 2026-08-06 Arc Testnet run: the
   * transfer sat at `received` with `txHash: null` for roughly 13 minutes and
   * then became `completed` carrying a genuine hash. This test pins the
   * transition that the previous implementation could never observe, because
   * it read `page.data[0]` from a response whose array is named `transfers`.
   */
  let polls = 0;
  gateway.getTransferById = async (id) => {
    polls += 1;
    return polls < 3
      ? { id, status: "received", txHash: null }
      : {
          id,
          status: "completed",
          txHash:
            "0xcccd6d68ed7395faf486bac891df2bf135bdd6c71fdda012009667170f5be6aa",
        };
  };

  const outcome = await adapter.waitForSettlement({
    transferId: "cad9fe1e-7201-40d0-b4d9-ce6a7c3655d4",
    timeoutMs: 5000,
    pollIntervalMs: 1,
  });
  assert.equal(outcome.status, "completed");
  assert.equal(outcome.transferId, "cad9fe1e-7201-40d0-b4d9-ce6a7c3655d4");
  assert.equal(
    outcome.txHash,
    "0xcccd6d68ed7395faf486bac891df2bf135bdd6c71fdda012009667170f5be6aa",
  );
});
