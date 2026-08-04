/**
 * CLI: run the seller's 402-protected capacity endpoint.
 *
 * Usage: pnpm --filter @parley/seller-service start [--db path] [--port 4021]
 *
 * The ledger path MUST be the same file the negotiation writes to, because the
 * seller prices each request from the deal row the negotiation recorded. An
 * in-memory ledger cannot work here: two processes, one agreement.
 */

import { loadConfigFromEnv } from "@parley/shared";
import { createCapacityPaywallApp } from "./create-capacity-paywall-app.js";

const DEFAULT_PORT = 4021;
const DEFAULT_LEDGER = "parley-ledger.db";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main(): void {
  const config = loadConfigFromEnv();

  if (config.sellerWalletAddress === undefined) {
    throw new Error(
      "SELLER_WALLET_ADDRESS is not set. Run `pnpm provision-wallets` first: " +
        "the seller needs an address to be paid at.",
    );
  }

  const port = Number(flag("--port") ?? DEFAULT_PORT);
  const ledgerPath = flag("--db") ?? DEFAULT_LEDGER;

  const { app } = createCapacityPaywallApp({
    sellerAddress: config.sellerWalletAddress,
    ledgerPath,
    onSettled: (dealId, transaction) => {
      console.log(
        `settled deal ${dealId}` +
          (transaction === undefined ? "" : ` tx ${transaction}`),
      );
    },
  });

  app.listen(port, () => {
    console.log(
      `seller service on http://127.0.0.1:${port}\n` +
        `  paying to  ${config.sellerWalletAddress}\n` +
        `  ledger     ${ledgerPath}\n` +
        `  route      POST /deals/:dealId/capacity  (402 until paid)`,
    );
  });
}

main();
