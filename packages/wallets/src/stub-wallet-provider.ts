/**
 * Deterministic fake wallet addresses, for running without Circle credentials.
 *
 * The addresses are derived from a fixed seed so they are stable across runs
 * (a changing buyer address between demo runs would be confusing on the
 * dashboard), and they are checksum-invalid nonsense by construction so nobody
 * can mistake one for a fundable account. They cannot receive faucet USDC.
 */

import { createHash } from "node:crypto";
import type {
  ProvisionedWallet,
  WalletProvider,
  WalletRole,
} from "./wallet-provider-interface.js";
import { WALLET_ROLES } from "./wallet-provider-interface.js";

const STUB_SEED = "parley-stub-wallet-v1";

/** Deterministic pseudo-address for a role. Not a real, fundable account. */
export function stubAddressForRole(role: WalletRole): string {
  const digest = createHash("sha256")
    .update(`${STUB_SEED}:${role}`, "utf8")
    .digest("hex");
  // 40 hex chars is the right shape for an EVM address. "stub" is spliced into
  // the leading bytes so the value reads as fake at a glance in any log.
  return `0xstub${digest.slice(0, 36)}`;
}

export class StubWalletProvider implements WalletProvider {
  readonly name = "stub";
  readonly isStub = true;

  async provisionAll(): Promise<ProvisionedWallet[]> {
    return WALLET_ROLES.map((role) => ({
      role,
      address: stubAddressForRole(role),
      isStub: true,
    }));
  }
}
