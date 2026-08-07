/**
 * CLI: ask Circle what actually happened to one transfer.
 *
 * Usage: pnpm --filter @parley/settlement transfer-status <transfer-id>
 *
 * ## Why this exists
 *
 * `settle()` returns PENDING with a transfer id and no on-chain hash, because
 * at authorisation time no hash exists: Circle batches on its own schedule and
 * there is no flush. So the run that pays is not the run that can report the
 * hash. This is how an operator finds out afterwards whether the batch landed.
 *
 * On the 2026-08-06 Arc Testnet run the answer took about 13 minutes to change
 * from `received` with `txHash: null` to `completed` with a real hash.
 *
 * Prints no key material. The buyer key is read from the environment only to
 * construct the client; the only other input is the id on argv.
 */

import { GatewayClient } from "@circle-fin/x402-batching/client";
import {
  ARC_TESTNET_EXPLORER_URL,
  ARC_TESTNET_SDK_CHAIN_NAME,
  loadConfigFromEnv,
} from "@parley/shared";

interface TransferRecord {
  readonly status: string;
  readonly txHash?: string | null;
}

async function main(): Promise<void> {
  const transferId = process.argv[2];
  if (transferId === undefined || transferId.length === 0) {
    throw new Error(
      "usage: pnpm --filter @parley/settlement transfer-status <transfer-id>\n" +
        "  the transfer id is the `reference` on the settlement receipt",
    );
  }

  const config = loadConfigFromEnv();
  if (config.buyerPrivateKey === undefined) {
    throw new Error(
      "BUYER_PRIVATE_KEY is not set. Run `pnpm provision-wallets` first.",
    );
  }

  const gateway = new GatewayClient({
    chain: ARC_TESTNET_SDK_CHAIN_NAME,
    privateKey: config.buyerPrivateKey,
  });

  const transfer = (await gateway.getTransferById(transferId)) as TransferRecord;

  // The SDK returns bigints, and `JSON.stringify` throws on those rather than
  // skipping them. Same trap that once made a successful deposit report failed.
  console.log(
    JSON.stringify(
      transfer,
      (_key, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
      2,
    ),
  );

  const hash = transfer.txHash ?? null;
  console.log(
    hash === null
      ? `\nstatus ${transfer.status}, no on-chain hash yet. The batch has not landed.`
      : `\nstatus ${transfer.status}\n` +
          `explorer ${ARC_TESTNET_EXPLORER_URL}/tx/${hash}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
