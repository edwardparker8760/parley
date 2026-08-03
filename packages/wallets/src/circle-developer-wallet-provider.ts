/**
 * Circle Developer-Controlled Wallets on Arc Testnet.
 *
 * SKELETON, same discipline as the settlement adapter: the concrete Circle SDK
 * calls land in phase 01 step 12 or phase 06, only once the installed package
 * has been read and recorded in docs/x402-sdk-verified-surface.md.
 *
 * Credentials are held privately and never logged. Any error raised from here
 * must be checked against `redactSecrets` before it reaches a log sink; the
 * Circle API key can otherwise appear in a stack trace or a response echo.
 */

import type {
  ProvisionedWallet,
  WalletProvider,
} from "./wallet-provider-interface.js";

export interface CircleDeveloperWalletProviderOptions {
  readonly apiKey: string;
  readonly entitySecret: string;
  /** CAIP-2 network identifier, e.g. eip155:5042002 for Arc Testnet. */
  readonly network: string;
}

export class CircleWalletProvisioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircleWalletProvisioningError";
  }
}

export class CircleDeveloperWalletProvider implements WalletProvider {
  readonly name = "circle-developer-controlled";
  readonly isStub = false;

  readonly #options: CircleDeveloperWalletProviderOptions;

  constructor(options: CircleDeveloperWalletProviderOptions) {
    if (options.apiKey.length === 0) {
      throw new CircleWalletProvisioningError("CIRCLE_API_KEY is empty");
    }
    if (options.entitySecret.length === 0) {
      throw new CircleWalletProvisioningError("CIRCLE_ENTITY_SECRET is empty");
    }
    this.#options = options;
  }

  get network(): string {
    return this.#options.network;
  }

  /** Redact key material from any string before it reaches a log. */
  redactSecrets(text: string): string {
    return text
      .split(this.#options.apiKey)
      .join("[REDACTED_CIRCLE_API_KEY]")
      .split(this.#options.entitySecret)
      .join("[REDACTED_CIRCLE_ENTITY_SECRET]");
  }

  async provisionAll(): Promise<ProvisionedWallet[]> {
    throw new CircleWalletProvisioningError(
      "Circle wallet provisioning is not implemented yet. It is written " +
        "against the SDK surface recorded by the phase 01 spike in " +
        "docs/x402-sdk-verified-surface.md, not against the blog post. " +
        "Run without CIRCLE_API_KEY to provision stub wallets instead.",
    );
  }
}
