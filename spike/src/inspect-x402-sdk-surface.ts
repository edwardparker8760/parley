/**
 * THROWAWAY SPIKE. Phase 01, step 10.
 *
 * Reads the real @circle-fin/x402-batching surface from the INSTALLED package
 * and prints what is actually there. The assumed surface in context/latest.md
 * came from a Circle blog post, not from the package, and phases 02 and 06 are
 * forbidden from building against the blog. This script produces the evidence
 * that docs/x402-sdk-verified-surface.md records.
 *
 * Deleted at the end of phase 02.
 *
 * Usage: pnpm --filter @parley/spike inspect-sdk
 */

import * as batchingRoot from "@circle-fin/x402-batching";
import * as batchingClient from "@circle-fin/x402-batching/client";
import * as batchingServer from "@circle-fin/x402-batching/server";
import { ARC_TESTNET_CAIP2, ARC_TESTNET_CHAIN_ID } from "@parley/shared";

function printExports(label: string, moduleNamespace: object): void {
  const names = Object.keys(moduleNamespace).sort();
  console.log(`\n=== ${label} (${names.length} runtime exports) ===`);
  for (const name of names) {
    const value = (moduleNamespace as Record<string, unknown>)[name];
    const kind =
      typeof value === "function"
        ? /^\s*class\s/.test(Function.prototype.toString.call(value))
          ? "class"
          : "function"
        : typeof value;
    console.log(`  ${name.padEnd(28)} ${kind}`);
  }
}

function main(): void {
  printExports("@circle-fin/x402-batching", batchingRoot);
  printExports("@circle-fin/x402-batching/client", batchingClient);
  printExports("@circle-fin/x402-batching/server", batchingServer);

  // The single most important question for Parley: is Arc Testnet actually a
  // first-class chain in this package, or did the research assume it?
  const domains = batchingClient.GATEWAY_DOMAINS;
  const configs = batchingClient.CHAIN_CONFIGS;

  console.log(`\n=== Arc Testnet support ===`);
  console.log(`  GATEWAY_DOMAINS.arcTestnet   ${domains.arcTestnet}`);

  const arcTestnet = configs.arcTestnet;
  console.log(`  chain.id                     ${arcTestnet.chain.id}`);
  console.log(`  chain.name                   ${arcTestnet.chain.name}`);
  console.log(`  domain                       ${arcTestnet.domain}`);
  console.log(`  usdc                         ${arcTestnet.usdc}`);
  console.log(`  gatewayWallet                ${arcTestnet.gatewayWallet}`);
  console.log(`  gatewayMinter                ${arcTestnet.gatewayMinter}`);
  console.log(`  rpcUrl                       ${arcTestnet.rpcUrl ?? "(default)"}`);

  const chainIdMatches = arcTestnet.chain.id === ARC_TESTNET_CHAIN_ID;
  console.log(
    `\n  our ARC_TESTNET_CHAIN_ID ${ARC_TESTNET_CHAIN_ID} ` +
      `(${ARC_TESTNET_CAIP2}) matches package: ${chainIdMatches}`,
  );
  if (!chainIdMatches) {
    console.error(
      `  MISMATCH: packages/shared/src/arc-network-constants.ts disagrees ` +
        `with the SDK. Fix the constant before anything settles.`,
    );
    process.exitCode = 1;
  }

  // Settlement status and manual flush: spec open question 4.
  const clientProto = batchingClient.GatewayClient.prototype as object;
  const clientMethods = Object.getOwnPropertyNames(clientProto)
    .filter((name) => name !== "constructor")
    .sort();
  console.log(`\n=== GatewayClient members (${clientMethods.length}) ===`);
  console.log(`  ${clientMethods.join("\n  ")}`);

  const flushLike = clientMethods.filter((name) =>
    /flush|batch|force|submit/i.test(name),
  );
  console.log(
    `\n  manual-flush-like methods: ${flushLike.length > 0 ? flushLike.join(", ") : "NONE"}`,
  );
  const statusLike = clientMethods.filter((name) =>
    /transfer|status/i.test(name),
  );
  console.log(
    `  settlement-status methods: ${statusLike.length > 0 ? statusLike.join(", ") : "NONE"}`,
  );
}

main();
