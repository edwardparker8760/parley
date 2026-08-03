/**
 * Wallet provisioning boundary.
 *
 * Parley uses the three-wallet topology from Circle's reference architecture
 * (context/latest.md section (c)): a buyer agent wallet, a seller agent wallet,
 * and a seller payout wallet. Three, not five: the multi-provider split from
 * the superseded pay-per-answer plan is gone.
 *
 * The topology is copied deliberately because it makes the money flow legible
 * on the dashboard: buyer Gateway balance pays, seller Gateway balance accrues,
 * seller withdraws on chain to payout.
 */

/** The three roles. Wallet addresses are public data; key material is not. */
export type WalletRole = "buyer" | "seller" | "seller-payout";

export const WALLET_ROLES: readonly WalletRole[] = [
  "buyer",
  "seller",
  "seller-payout",
];

export interface ProvisionedWallet {
  readonly role: WalletRole;
  /** 0x-prefixed EVM address. Public data, safe to log and commit. */
  readonly address: string;
  /** Provider-side wallet identifier, when the provider issues one. */
  readonly walletId?: string;
  /** True when this address is fabricated and cannot hold or move funds. */
  readonly isStub: boolean;
}

export interface WalletProvider {
  readonly name: string;
  readonly isStub: boolean;
  /** Provision (or fetch) one wallet per role, in WALLET_ROLES order. */
  provisionAll(): Promise<ProvisionedWallet[]>;
}
