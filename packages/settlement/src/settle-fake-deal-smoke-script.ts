/**
 * Smoke test: settle one fake deal through the configured adapter.
 *
 * This is phase 01 success criterion 3. Its job is to prove that phases 02 to
 * 05 are NOT blocked on Circle credentials: with the default configuration it
 * produces a complete receipt without any network access or key material.
 *
 * Usage: pnpm --filter @parley/settlement smoke
 */

import { formatMicroAsUsdc, loadConfigFromEnv, describeConfig } from "@parley/shared";
import type { Offer } from "@parley/shared";
import { computeTermsHash } from "./deal-terms-hash.js";
import { createSettlementAdapter } from "./settlement-adapter-factory.js";

const FAKE_DEAL_ID = "smoke-deal-0001";

const FAKE_OFFER: Offer = {
  unitPriceMicroUsdc: 850n,
  quantity: 1_000,
  terms: { deliveryWindowHours: 24, slaTier: "standard" },
};

async function main(): Promise<void> {
  const config = loadConfigFromEnv();
  console.log(`config: ${describeConfig(config)}`);

  const adapter = createSettlementAdapter(config);
  const termsHash = computeTermsHash(FAKE_DEAL_ID, FAKE_OFFER);

  const startedAt = Date.now();
  const receipt = await adapter.settle({
    dealId: FAKE_DEAL_ID,
    agreedOffer: FAKE_OFFER,
    termsHash,
    buyerAddress: config.buyerWalletAddress ?? "0xstub-buyer",
    sellerAddress: config.sellerWalletAddress ?? "0xstub-seller",
  });
  const elapsedMs = Date.now() - startedAt;

  console.log(`adapter:    ${adapter.name}`);
  console.log(`status:     ${receipt.status}`);
  console.log(`reference:  ${receipt.reference}`);
  console.log(`amount:     ${formatMicroAsUsdc(receipt.amountMicroUsdc)} USDC`);
  console.log(`termsHash:  ${receipt.termsHash}`);
  console.log(`isStub:     ${receipt.isStub}`);
  console.log(`settledAt:  ${receipt.settledAt}`);
  console.log(`elapsed:    ${elapsedMs}ms`);

  if (receipt.isStub) {
    console.log(
      `\nSIMULATED: no money moved. For real settlement on Arc Testnet, run ` +
        `\`pnpm provision-wallets\`, fund the addresses at the faucet, then ` +
        `set BUYER_PRIVATE_KEY, SELLER_WALLET_ADDRESS and ` +
        `SETTLEMENT_MODE=arc-x402.`,
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`settlement smoke failed: ${message}`);
  process.exitCode = 1;
});
