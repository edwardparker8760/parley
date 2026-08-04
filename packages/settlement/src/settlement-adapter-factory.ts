/**
 * Selects a settlement adapter from config.
 *
 * The rule this file enforces: asking for real settlement and not getting it
 * is an ERROR, never a quiet downgrade to the stub. The operator has to be
 * told, because the difference between the two is the difference between a
 * real transaction hash and a fabricated one.
 */

import {
  ARC_TESTNET_CAIP2,
  ARC_TESTNET_SDK_CHAIN_NAME,
  CIRCLE_X402_FACILITATOR_URL,
  type ParleyConfig,
} from "@parley/shared";
import { ArcX402SettlementAdapter } from "./arc-x402-settlement-adapter.js";
import { LocalStubSettlementAdapter } from "./local-stub-settlement-adapter.js";
import type { SettlementAdapter } from "./settlement-adapter-interface.js";
import { SettlementNotConfiguredError } from "./settlement-adapter-interface.js";

export function createSettlementAdapter(
  config: ParleyConfig,
): SettlementAdapter {
  if (config.settlementMode === "local-stub") {
    return new LocalStubSettlementAdapter({
      latencyMs: config.settlementStubLatencyMs,
    });
  }

  // loadConfigFromEnv already rejects arc-x402 without keys. Re-checked here so
  // the invariant holds for callers that build a config by hand.
  if (
    config.buyerPrivateKey === undefined ||
    config.sellerWalletAddress === undefined
  ) {
    throw new SettlementNotConfiguredError(
      "SETTLEMENT_MODE=arc-x402 needs BUYER_PRIVATE_KEY and " +
        "SELLER_WALLET_ADDRESS. Run `pnpm provision-wallets` and fund them.",
    );
  }

  return new ArcX402SettlementAdapter({
    buyerPrivateKey: config.buyerPrivateKey,
    sellerAddress: config.sellerWalletAddress,
    chain: ARC_TESTNET_SDK_CHAIN_NAME,
    network: ARC_TESTNET_CAIP2,
    facilitatorUrl: CIRCLE_X402_FACILITATOR_URL,
    sellerServiceUrl: config.sellerServiceUrl,
  });
}
