/**
 * Prints the native and USDC balance of each provisioned wallet on Arc Testnet.
 *
 * Phase 06 step 10 exists because a settlement that fails on an unfunded
 * wallet looks exactly like a settlement that fails on a broken adapter, and
 * telling the two apart costs the better part of an hour. Run this first.
 *
 * Reads addresses only. No private key is loaded, printed, or used here.
 *
 * Usage: pnpm --filter @parley/wallets balances
 */

import { createPublicClient, formatUnits, http } from "viem";
import {
  ARC_TESTNET_FAUCET_URL,
  ARC_TESTNET_RPC_URL,
  ARC_TESTNET_USDC_ADDRESS,
  USDC_DECIMALS,
  loadConfigFromEnv,
} from "@parley/shared";

const ERC20_BALANCE_OF = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

async function main(): Promise<void> {
  const config = loadConfigFromEnv();
  const wallets: { label: string; address: string | undefined }[] = [
    { label: "buyer", address: config.buyerWalletAddress },
    { label: "seller", address: config.sellerWalletAddress },
    { label: "seller payout", address: config.sellerPayoutWalletAddress },
  ];

  const client = createPublicClient({ transport: http(ARC_TESTNET_RPC_URL) });
  console.log(`Arc Testnet balances (${ARC_TESTNET_RPC_URL})\n`);

  let anyFunded = false;
  for (const wallet of wallets) {
    if (wallet.address === undefined) {
      console.log(`${wallet.label.padEnd(14)} not provisioned`);
      continue;
    }
    const address = wallet.address as `0x${string}`;
    const [native, usdc] = await Promise.all([
      client.getBalance({ address }),
      client.readContract({
        address: ARC_TESTNET_USDC_ADDRESS,
        abi: ERC20_BALANCE_OF,
        functionName: "balanceOf",
        args: [address],
      }),
    ]);
    if (usdc > 0n) anyFunded = true;
    console.log(
      `${wallet.label.padEnd(14)} ${address}\n` +
        `${" ".repeat(14)} USDC ${formatUnits(usdc, USDC_DECIMALS)}` +
        `   native ${formatUnits(native, 18)}`,
    );
  }

  if (!anyFunded) {
    console.log(
      `\nNo USDC found. Fund the buyer address at ${ARC_TESTNET_FAUCET_URL} ` +
        `(select Arc Testnet) before attempting real settlement.`,
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`balances check failed: ${message}`);
  process.exitCode = 1;
});
