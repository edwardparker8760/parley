/**
 * Arc Testnet connection constants.
 *
 * Every value here was verified first-party on 2026-07-26 against Circle's
 * `use-arc` skill and cross-checked on ChainList. See context/latest.md
 * section (a) and the Verification Log at the bottom of that file.
 *
 * Testnet only. Mainnet values deliberately absent: Nanopayments is not
 * available on Arc mainnet (context/latest.md section (c)), and no mainnet
 * key material may enter this repo.
 */

/** EVM chain id for Arc Testnet. */
export const ARC_TESTNET_CHAIN_ID = 5042002;

/** CAIP-2 network identifier, the form the x402 facilitator expects. */
export const ARC_TESTNET_CAIP2 = "eip155:5042002" as const;

export const ARC_TESTNET_RPC_URL = "https://rpc.testnet.arc.network" as const;
export const ARC_TESTNET_WS_URL = "wss://rpc.testnet.arc.network" as const;
export const ARC_TESTNET_EXPLORER_URL = "https://testnet.arcscan.app" as const;

/**
 * Circle's own x402 facilitator. Coinbase's facilitator does NOT serve Arc;
 * pointing at it is the single most likely wiring mistake here.
 * See context/latest.md section (b).
 */
export const CIRCLE_X402_FACILITATOR_URL =
  "https://gateway-api-testnet.circle.com" as const;

/**
 * Arc Testnet USDC faucet. Roughly 20 USDC per request, once every 2 hours,
 * per address (rate re-checked 2026-07-27; an earlier "1 USDC/day" figure was
 * wrong in the pessimistic direction). Funding is not a constraint on the demo.
 */
export const ARC_TESTNET_FAUCET_URL = "https://faucet.circle.com" as const;

/**
 * Chain name in the `@circle-fin/x402-batching` vocabulary, which is its own
 * key set rather than CAIP-2. Verified against CHAIN_CONFIGS in the installed
 * package; see docs/x402-sdk-verified-surface.md.
 */
export const ARC_TESTNET_SDK_CHAIN_NAME = "arcTestnet" as const;

/** Circle Gateway domain id for Arc Testnet. Verified from GATEWAY_DOMAINS. */
export const ARC_TESTNET_GATEWAY_DOMAIN = 26;

/**
 * Contract addresses, read from CHAIN_CONFIGS.arcTestnet in the installed SDK
 * on 2026-08-03. Recorded here for the dashboard's explorer links. The SDK
 * remains the source of truth for anything that signs.
 */
export const ARC_TESTNET_USDC_ADDRESS =
  "0x3600000000000000000000000000000000000000" as const;
export const ARC_TESTNET_GATEWAY_WALLET_ADDRESS =
  "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as const;
export const ARC_TESTNET_GATEWAY_MINTER_ADDRESS =
  "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B" as const;

/** USDC has 6 decimals, so the base unit is one micro-USDC. */
export const USDC_DECIMALS = 6;

/** Build a block explorer link for a transaction hash. */
export function explorerTxUrl(txHash: string): string {
  return `${ARC_TESTNET_EXPLORER_URL}/tx/${txHash}`;
}

/** Build a block explorer link for an address. */
export function explorerAddressUrl(address: string): string {
  return `${ARC_TESTNET_EXPLORER_URL}/address/${address}`;
}
