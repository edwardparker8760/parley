/**
 * Local EVM keypair wallets. THIS IS THE PRIMARY PATH.
 *
 * The phase 01 SDK spike established that `GatewayClient` authenticates with a
 * raw EVM private key through viem, not with a Circle API key and entity
 * secret (docs/x402-sdk-verified-surface.md, "DIVERGENCE"). So the wallets
 * Parley actually needs are three ordinary keypairs whose addresses have been
 * funded from the Arc Testnet faucet.
 *
 * Security posture, and it is the real cost of this approach: private keys sit
 * in `.env`. Testnet only. Funded with faucet USDC that is worth nothing. Never
 * reused anywhere else, never logged, never committed. The one place a key is
 * ever written is `.env.local.generated`, which is gitignored.
 */

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import type {
  ProvisionedWallet,
  WalletProvider,
  WalletRole,
} from "./wallet-provider-interface.js";
import { WALLET_ROLES } from "./wallet-provider-interface.js";

/** A generated keypair. The private key never leaves the provisioning path. */
export interface LocalKeypair {
  readonly role: WalletRole;
  readonly address: string;
  readonly privateKey: Hex;
}

export interface LocalKeyWalletProviderOptions {
  /**
   * Existing private keys by role. When a role is absent a fresh key is
   * generated. Supplying keys makes provisioning idempotent, so re-running
   * the script does not orphan already-funded addresses.
   */
  readonly existingKeys?: Partial<Record<WalletRole, Hex>>;
}

export class LocalKeyWalletProvider implements WalletProvider {
  readonly name = "local-evm-key";
  readonly isStub = false;

  readonly #existingKeys: Partial<Record<WalletRole, Hex>>;
  #keypairs: LocalKeypair[] = [];

  constructor(options: LocalKeyWalletProviderOptions = {}) {
    this.#existingKeys = options.existingKeys ?? {};
  }

  async provisionAll(): Promise<ProvisionedWallet[]> {
    this.#keypairs = WALLET_ROLES.map((role) => {
      const privateKey = this.#existingKeys[role] ?? generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      return { role, address: account.address, privateKey };
    });

    return this.#keypairs.map(({ role, address }) => ({
      role,
      address,
      isStub: false,
    }));
  }

  /**
   * Keypairs including private keys, for writing to the gitignored env file.
   *
   * Deliberately a separate call from `provisionAll`, so the secret-bearing
   * shape is never the default return value that some caller logs by accident.
   */
  revealKeypairsForEnvFile(): readonly LocalKeypair[] {
    if (this.#keypairs.length === 0) {
      throw new Error("Call provisionAll() before revealing keypairs.");
    }
    return this.#keypairs;
  }

  /** True when every role was supplied rather than freshly generated. */
  get reusedAllExistingKeys(): boolean {
    return WALLET_ROLES.every(
      (role) => this.#existingKeys[role] !== undefined,
    );
  }
}
