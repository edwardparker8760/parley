/**
 * Real settlement on Arc Testnet via Circle Gateway x402 batching.
 *
 * Built strictly against `docs/x402-sdk-verified-surface.md`, which was read
 * from the installed package rather than from Circle's blog. Nothing here is
 * inferred from marketing copy.
 *
 * ## The flow, and why it has the shape it has
 *
 *   1. The seller's unpriced quote first. A cheap precondition: if the seller
 *      is not there, does not know this deal, or disagrees about the amount,
 *      fail now with a clear message rather than after a signature. See the
 *      note in `settle` for why this is the quote and not
 *      `GatewayClient.supports()`.
 *   2. `pay(url)` runs the whole 402 dance: request, 402, find the batching
 *      option, sign an EIP-3009 authorization, retry with the signature. The
 *      seller prices the route from its own copy of the deal, so the amount is
 *      the seller's number and this side cannot underpay.
 *   3. The result is an AUTHORIZATION, not a confirmed on-chain transfer.
 *      Circle batches, and **there is no manual flush**, so the receipt comes
 *      back `PENDING` unless polling sees it reach a settled state.
 *
 * ## Vocabulary, which matters for the submission
 *
 * "Authorisation issued, then batch settled" is the truthful description.
 * Saying "payment confirmed on-chain" per deal would be false: batch timing is
 * Circle's, not ours. `waitForSettlement` exists so the demo can report what
 * actually happened rather than what it hoped for.
 *
 * A failure here NEVER downgrades to the stub. It throws, and the caller marks
 * the receipt FAILED. A silent downgrade is how a fabricated transaction hash
 * reaches a submission video.
 */

import { GatewayClient } from "@circle-fin/x402-batching/client";
import type { MicroUsdc } from "@parley/shared";
import { multiplyByQuantity } from "@parley/shared";
import type {
  SettlementAdapter,
  SettlementReceipt,
  SettlementRequest,
} from "./settlement-adapter-interface.js";
import { SettlementNotConfiguredError } from "./settlement-adapter-interface.js";
import { microUsdcToDecimalString } from "./micro-usdc-to-price-string.js";

/** Circle's transfer lifecycle. `completed` is the only settled state. */
export type TransferLifecycleStatus =
  | "received"
  | "batched"
  | "confirmed"
  | "completed"
  | "failed";

const SETTLED_STATES: readonly string[] = ["completed"];

export interface ArcX402SettlementAdapterOptions {
  /**
   * Buyer's EVM private key. GatewayClient signs EIP-3009 authorizations with
   * this via viem. Testnet only.
   */
  readonly buyerPrivateKey: `0x${string}`;
  /** Seller address that receives payment. */
  readonly sellerAddress: string;
  /** SupportedChainName in the SDK's vocabulary, e.g. "arcTestnet". */
  readonly chain: string;
  /** CAIP-2 identifier, for logging and for the seller middleware config. */
  readonly network: string;
  readonly facilitatorUrl: string;
  /** Base URL of the seller's 402-protected service. */
  readonly sellerServiceUrl: string;
  /** Injected in tests. Defaults to a real GatewayClient. */
  readonly client?: GatewayLike;
  /** Injected in tests. Defaults to the global fetch, for the quote probe. */
  readonly fetchImpl?: typeof globalThis.fetch;
}

/** The slice of GatewayClient this adapter uses. Narrow, so it is stubbable. */
export interface GatewayLike {
  pay<T>(
    url: string,
    options?: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown },
  ): Promise<{ amount: bigint; transaction: string; status: number; data: T }>;
  /**
   * `txHash` is null until Circle's batch lands, then it is the real on-chain
   * hash. That transition is the entire point of `waitForSettlement`.
   */
  getTransferById(id: string): Promise<
    { id: string; status: string; txHash?: string | null } & Record<string, unknown>
  >;
}

export class ArcX402SettlementAdapter implements SettlementAdapter {
  readonly name = "arc-x402";
  readonly isStub = false;

  readonly #options: ArcX402SettlementAdapterOptions;
  #gateway: GatewayLike | null = null;

  constructor(options: ArcX402SettlementAdapterOptions) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(options.buyerPrivateKey)) {
      throw new SettlementNotConfiguredError(
        "buyerPrivateKey must be a 0x-prefixed 32-byte hex private key",
      );
    }
    if (options.sellerAddress.length === 0) {
      throw new SettlementNotConfiguredError("sellerAddress is empty");
    }
    if (options.sellerServiceUrl.length === 0) {
      throw new SettlementNotConfiguredError(
        "sellerServiceUrl is empty. Real settlement pays an HTTP resource " +
          "that answers 402; start @parley/seller-service and set " +
          "SELLER_SERVICE_URL.",
      );
    }
    this.#options = options;
  }

  get facilitatorUrl(): string {
    return this.#options.facilitatorUrl;
  }

  get chain(): string {
    return this.#options.chain;
  }

  /** Built lazily so constructing the adapter never touches the network. */
  get gateway(): GatewayLike {
    if (this.#gateway === null) {
      this.#gateway =
        this.#options.client ??
        (new GatewayClient({
          chain: this.#options.chain as "arcTestnet",
          privateKey: this.#options.buyerPrivateKey,
        }) as unknown as GatewayLike);
    }
    return this.#gateway;
  }

  #capacityUrl(dealId: string): string {
    return `${this.#options.sellerServiceUrl.replace(/\/+$/, "")}/deals/${dealId}/capacity`;
  }

  #quoteUrl(dealId: string): string {
    return `${this.#options.sellerServiceUrl.replace(/\/+$/, "")}/deals/${dealId}/quote`;
  }

  /**
   * The seller's own amount for this deal, or null if it cannot be obtained.
   *
   * Null covers every "the seller is not there" case: connection refused, a
   * 404 for a deal it does not know, malformed JSON. They all mean the same
   * thing to the caller, and they all produce the same actionable message.
   */
  async #fetchQuotedAmount(dealId: string): Promise<bigint | null> {
    const fetchImpl = this.#options.fetchImpl ?? globalThis.fetch;
    try {
      const response = await fetchImpl(this.#quoteUrl(dealId));
      if (!response.ok) return null;
      const body = (await response.json()) as { amountMicroUsdc?: unknown };
      if (typeof body.amountMicroUsdc !== "string") return null;
      return BigInt(body.amountMicroUsdc);
    } catch {
      return null;
    }
  }

  async settle(request: SettlementRequest): Promise<SettlementReceipt> {
    const url = this.#capacityUrl(request.dealId);
    const expected = expectedAmount(request);

    /*
     * The precondition is the seller's QUOTE, not `GatewayClient.supports()`.
     *
     * `supports()` probes the paid route with no body, and the paid route
     * answers 409 to a request that carries no terms hash, before it will
     * quote any price at all. So the probe sees "not 402" and reports the
     * seller as not offering Gateway batching, on a seller that offers it
     * perfectly well: the same route answers 402 the moment the correct hash
     * is presented. Measured against the live service on 2026-08-06.
     *
     * Weakening the seller to satisfy the probe was the wrong direction.
     * Refusing to price before the terms hash matches is the property that
     * makes a payment inseparable from the negotiation that produced it.
     *
     * The quote route is unpriced and needs no body, so it can answer. It is
     * also a STRONGER precondition than the boolean it replaces: it proves the
     * service is up, that it knows this deal, and that it agrees on the amount,
     * and it catches a price disagreement BEFORE a signature rather than after.
     */
    const quoted = await this.#fetchQuotedAmount(request.dealId);
    if (quoted === null) {
      throw new SettlementNotConfiguredError(
        `${this.#quoteUrl(request.dealId)} did not answer with a quote. Is ` +
          `@parley/seller-service running, and pointed at the same ledger?`,
      );
    }
    if (quoted !== expected) {
      throw new Error(
        `The seller quotes ${quoted} atomic units but the deal is ${expected}. ` +
          `Refusing to sign a payment for a different deal than the one agreed.`,
      );
    }

    const result = await this.gateway.pay<unknown>(url, {
      method: "POST",
      body: { termsHash: request.termsHash },
    });

    // The seller quotes the price, so a mismatch means the two sides disagree
    // about what was agreed. That is a correctness failure, not a rounding
    // detail, and it must not be recorded as a successful settlement.
    if (result.amount !== expected) {
      throw new Error(
        `Paid ${result.amount} atomic units but the deal is ${expected}. ` +
          `The seller priced a different deal; refusing to record this as ` +
          `settlement of ${request.dealId}.`,
      );
    }

    return {
      dealId: request.dealId,
      // PENDING, deliberately. An authorization has been signed and accepted;
      // Circle settles the batch on its own schedule and there is no flush.
      status: "PENDING",
      reference: result.transaction,
      /*
       * NOT `result.transaction`. That value is Circle's transfer id, a UUID,
       * and the transfer record carries `txHash: null` until the batch lands.
       * Assigning it here produced an "explorer URL" of the form
       * `.../tx/<uuid>`, which arcscan answers 200 for because it is a single
       * page app: a link that looks like proof of an on-chain transaction and
       * is not one. There is no hash at authorization time, so there is none
       * to record. `waitForSettlement` is what observes the real one.
       *
       * The field is OMITTED rather than set: `txHash` is `string | undefined`
       * on the receipt, and `finalise-negotiation-outcome.ts` builds an
       * explorer URL only when it is not undefined. Leaving it out is what
       * makes the explorer link correctly absent.
       */
      amountMicroUsdc: expected,
      termsHash: request.termsHash,
      isStub: false,
      settledAt: new Date().toISOString(),
    };
  }

  /**
   * Poll one transfer until it reaches a settled state, or the budget runs out.
   *
   * Separate from `settle` on purpose: settlement must not block the demo, and
   * batch latency is Circle's to determine. The phase 08 video script needs
   * this number measured, so this returns what it observed rather than
   * pretending the wait succeeded.
   *
   * ## Why this polls an ID and not `searchTransfers`
   *
   * It used to call `searchTransfers({ from, network })` and read `page.data[0]`.
   * Two things were wrong with that, both measured against the live API on
   * 2026-08-07:
   *
   *   1. The SDK answers `{ transfers: [...] }`, not `{ data: [...] }`. So
   *      `page.data?.[0]` was ALWAYS undefined, and this method could only ever
   *      run out its timeout and report `unknown`. It never observed anything.
   *   2. The response came back carrying transfers between addresses unrelated
   *      to ours, so the `from` filter is not doing what the name suggests.
   *      "Newest transfer from this address" was therefore not a safe way to
   *      identify our own payment even once the shape was fixed.
   *
   * `getTransferById` takes the id that `settle` already returned as the
   * receipt's `reference`, and answers about exactly that transfer. There is no
   * shape to guess and no race with somebody else's payment.
   */
  async waitForSettlement(options: {
    transferId: string;
    timeoutMs: number;
    pollIntervalMs?: number;
    now?: () => number;
  }): Promise<{
    status: string;
    transferId: string;
    /** The real on-chain hash, once the batch has landed. Null before that. */
    txHash: string | null;
    waitedMs: number;
  }> {
    const clock = options.now ?? (() => Date.now());
    const interval = options.pollIntervalMs ?? 3000;
    const startedAt = clock();

    let lastStatus = "unknown";
    let txHash: string | null = null;

    while (clock() - startedAt < options.timeoutMs) {
      const transfer = await this.gateway.getTransferById(options.transferId);
      lastStatus = transfer.status;
      txHash = transfer.txHash ?? null;
      if (SETTLED_STATES.includes(transfer.status) || transfer.status === "failed") {
        return {
          status: transfer.status,
          transferId: options.transferId,
          txHash,
          waitedMs: clock() - startedAt,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    return {
      status: lastStatus,
      transferId: options.transferId,
      txHash,
      waitedMs: clock() - startedAt,
    };
  }
}

/** What this deal is worth, in atomic units, computed the same way twice. */
function expectedAmount(request: SettlementRequest): MicroUsdc {
  return multiplyByQuantity(
    request.agreedOffer.unitPriceMicroUsdc,
    request.agreedOffer.quantity,
  );
}

/** Exported for the smoke script and the latency measurement. */
export function describeAmount(micro: MicroUsdc): string {
  return `${microUsdcToDecimalString(micro)} USDC`;
}
