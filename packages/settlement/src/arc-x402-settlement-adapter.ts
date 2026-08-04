/**
 * Real settlement on Arc Testnet via Circle Gateway x402 batching.
 *
 * Built strictly against `docs/x402-sdk-verified-surface.md`, which was read
 * from the installed package rather than from Circle's blog. Nothing here is
 * inferred from marketing copy.
 *
 * ## The flow, and why it has the shape it has
 *
 *   1. `supports(url)` first. A cheap precondition: if the seller is not
 *      offering Gateway batching, fail now with a clear message rather than
 *      after a signature.
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
}

/** The slice of GatewayClient this adapter uses. Narrow, so it is stubbable. */
export interface GatewayLike {
  supports(url: string): Promise<{ supported: boolean } & Record<string, unknown>>;
  pay<T>(
    url: string,
    options?: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown },
  ): Promise<{ amount: bigint; transaction: string; status: number; data: T }>;
  searchTransfers(params?: Record<string, unknown>): Promise<{
    data?: { id: string; status: string; amount: string; createdAt: string }[];
  } & Record<string, unknown>>;
  getTransferById(id: string): Promise<{ id: string; status: string } & Record<string, unknown>>;
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

  async settle(request: SettlementRequest): Promise<SettlementReceipt> {
    const url = this.#capacityUrl(request.dealId);
    const expected = expectedAmount(request);

    const support = await this.gateway.supports(url);
    if (support.supported !== true) {
      throw new SettlementNotConfiguredError(
        `${url} does not offer Gateway batching. Is @parley/seller-service ` +
          `running, and pointed at the same ledger?`,
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
      txHash: result.transaction,
      amountMicroUsdc: expected,
      termsHash: request.termsHash,
      isStub: false,
      settledAt: new Date().toISOString(),
    };
  }

  /**
   * Poll until the transfer reaches a settled state, or the budget runs out.
   *
   * Separate from `settle` on purpose: settlement must not block the demo, and
   * batch latency is Circle's to determine. The phase 08 video script needs
   * this number measured, so this returns what it observed rather than
   * pretending the wait succeeded.
   */
  async waitForSettlement(options: {
    fromAddress: string;
    timeoutMs: number;
    pollIntervalMs?: number;
    now?: () => number;
  }): Promise<{ status: string; transferId: string | null; waitedMs: number }> {
    const clock = options.now ?? (() => Date.now());
    const interval = options.pollIntervalMs ?? 3000;
    const startedAt = clock();

    let lastStatus = "unknown";
    let transferId: string | null = null;

    while (clock() - startedAt < options.timeoutMs) {
      const page = await this.gateway.searchTransfers({
        from: options.fromAddress,
        network: this.#options.network,
      });
      const newest = page.data?.[0];
      if (newest !== undefined) {
        transferId = newest.id;
        lastStatus = newest.status;
        if (SETTLED_STATES.includes(newest.status) || newest.status === "failed") {
          return { status: newest.status, transferId, waitedMs: clock() - startedAt };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    return { status: lastStatus, transferId, waitedMs: clock() - startedAt };
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
