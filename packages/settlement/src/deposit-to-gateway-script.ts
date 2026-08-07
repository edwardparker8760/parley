/**
 * CLI: move USDC from the buyer's wallet into its Gateway balance.
 *
 * Usage: pnpm --filter @parley/settlement deposit [amount]   (default 5)
 *
 * ## Why this is a separate step
 *
 * Faucet USDC lands in the WALLET. Gateway payments spend a GATEWAY balance,
 * which is a different pot: `deposit()` approves the GatewayWallet contract and
 * transfers into it. A buyer with 20 USDC in its wallet and nothing in Gateway
 * cannot pay for anything, and the failure it produces does not say so.
 *
 * This also costs gas on Arc, so the buyer needs the native token as well as
 * USDC. `pnpm --filter @parley/wallets balances` shows both.
 */

import { GatewayClient } from "@circle-fin/x402-batching/client";
import {
  ARC_TESTNET_FAUCET_URL,
  ARC_TESTNET_SDK_CHAIN_NAME,
  loadConfigFromEnv,
} from "@parley/shared";

async function main(): Promise<void> {
  const config = loadConfigFromEnv();
  if (config.buyerPrivateKey === undefined) {
    throw new Error(
      "BUYER_PRIVATE_KEY is not set. Run `pnpm provision-wallets` first.",
    );
  }

  const amount = process.argv[2] ?? "5";
  const gateway = new GatewayClient({
    chain: ARC_TESTNET_SDK_CHAIN_NAME,
    privateKey: config.buyerPrivateKey,
  });

  const before = await gateway.getBalances();
  console.log(
    `buyer ${gateway.address}\n` +
      `  wallet  ${before.wallet.formatted} USDC\n` +
      `  gateway ${before.gateway.available} available (atomic units)`,
  );

  if (before.wallet.balance === 0n) {
    throw new Error(
      `Wallet holds no USDC. Fund ${gateway.address} at ` +
        `${ARC_TESTNET_FAUCET_URL} (select Arc Testnet), then run this again.`,
    );
  }

  console.log(`\ndepositing ${amount} USDC into Gateway...`);
  const result = await gateway.deposit(amount);
  /*
   * The SDK returns bigints in this result, and `JSON.stringify` throws on a
   * bigint rather than skipping it. That threw AFTER the deposit had already
   * landed on chain, so the script reported "deposit failed" for a deposit that
   * succeeded, which is the most expensive kind of wrong: the operator's next
   * move is to retry a transfer they have already paid for.
   */
  console.log(
    `  done: ${JSON.stringify(result, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    )}`,
  );

  const after = await gateway.getBalances();
  console.log(
    `\nafter\n` +
      `  wallet  ${after.wallet.formatted} USDC\n` +
      `  gateway ${after.gateway.available} available (atomic units)`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`deposit failed: ${message}`);
  process.exitCode = 1;
});
