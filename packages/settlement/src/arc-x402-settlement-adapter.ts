/**
 * Real settlement on Arc Testnet via Circle Gateway x402 batching.
 *
 * SKELETON. Phase 06 fills this in, against the API surface recorded in
 * docs/x402-sdk-verified-surface.md by the phase 01 spike, which was read from
 * the installed package rather than from Circle's blog post.
 *
 * What that spike established, and what phase 06 will use:
 *
 *   import { GatewayClient } from "@circle-fin/x402-batching/client";
 *   const gateway = new GatewayClient({ chain: "arcTestnet", privateKey });
 *   await gateway.deposit("1.0");            // wallet -> Gateway balance, once
 *   const result = await gateway.pay(url);   // handles the whole 402 flow
 *   await gateway.getTransferById(id);       // real settlement status
 *
 * Settlement status is a five-state lifecycle Circle owns:
 * received -> batched -> confirmed -> completed, or failed. There is NO manual
 * flush; batch timing cannot be forced from our side. Phase 06 must MEASURE
 * real latency rather than assume it, before the demo video is scripted.
 *
 * Until phase 06 lands, every call throws. It does not fall back to the stub:
 * a silent downgrade from real to simulated settlement is the one failure mode
 * that could put a fabricated transaction hash into the submission.
 */

import type {
  SettlementAdapter,
  SettlementReceipt,
  SettlementRequest,
} from "./settlement-adapter-interface.js";
import { SettlementNotConfiguredError } from "./settlement-adapter-interface.js";

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
}

export class ArcX402SettlementAdapter implements SettlementAdapter {
  readonly name = "arc-x402";
  readonly isStub = false;

  readonly #options: ArcX402SettlementAdapterOptions;

  constructor(options: ArcX402SettlementAdapterOptions) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(options.buyerPrivateKey)) {
      throw new SettlementNotConfiguredError(
        "buyerPrivateKey must be a 0x-prefixed 32-byte hex private key",
      );
    }
    if (options.sellerAddress.length === 0) {
      throw new SettlementNotConfiguredError("sellerAddress is empty");
    }
    this.#options = options;
  }

  get facilitatorUrl(): string {
    return this.#options.facilitatorUrl;
  }

  get chain(): string {
    return this.#options.chain;
  }

  async settle(_request: SettlementRequest): Promise<SettlementReceipt> {
    throw new SettlementNotConfiguredError(
      "arc-x402 settlement is not implemented until phase 06. " +
        "Run with SETTLEMENT_MODE=local-stub, or complete phase 06 against " +
        "docs/x402-sdk-verified-surface.md.",
    );
  }
}
