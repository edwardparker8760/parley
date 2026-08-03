/**
 * Typed environment loader.
 *
 * Design rule: missing Circle credentials is a LEGAL state. It selects the
 * local stub settlement adapter so that phases 02 to 05, the actual
 * differentiator, stay buildable and demoable while credentials are pending.
 * A bad value, by contrast, is fatal: we fail loudly rather than silently
 * downgrading, because a silent downgrade is how a fake transaction hash ends
 * up in a submission video.
 *
 * Secrets are read here and never logged. `describeConfig` exists so callers
 * can print a startup banner without ever touching key material.
 */

export type SettlementMode = "local-stub" | "arc-x402";
export type LlmMode = "off" | "rationale-only" | "full";

/** 0x-prefixed 32-byte EVM private key. */
export type PrivateKeyHex = `0x${string}`;

export interface ParleyConfig {
  readonly settlementMode: SettlementMode;
  readonly settlementStubLatencyMs: number;
  readonly circleApiKey: string | undefined;
  readonly circleEntitySecret: string | undefined;
  readonly buyerWalletAddress: string | undefined;
  readonly sellerWalletAddress: string | undefined;
  readonly sellerPayoutWalletAddress: string | undefined;
  readonly buyerPrivateKey: PrivateKeyHex | undefined;
  readonly sellerPrivateKey: PrivateKeyHex | undefined;
  readonly sellerPayoutPrivateKey: PrivateKeyHex | undefined;
  readonly llmMode: LlmMode;
  readonly llmApiKey: string | undefined;
  readonly llmModel: string;
}

const SETTLEMENT_MODES: readonly SettlementMode[] = ["local-stub", "arc-x402"];
const LLM_MODES: readonly LlmMode[] = ["off", "rationale-only", "full"];

function readOptional(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const raw = env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function readEnum<T extends string>(
  env: NodeJS.ProcessEnv,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = readOptional(env, name);
  if (raw === undefined) return fallback;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new Error(
      `${name} must be one of ${allowed.join(", ")}, got "${raw}".`,
    );
  }
  return raw as T;
}

function readPositiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = readOptional(env, name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer, got "${raw}".`);
  }
  return parsed;
}

/**
 * Read a private key, validating its shape.
 *
 * A malformed key is fatal rather than ignored: silently treating it as absent
 * would fall back to an unfunded wallet and produce a confusing settlement
 * failure much later, far from the actual typo.
 */
function readPrivateKey(
  env: NodeJS.ProcessEnv,
  name: string,
): PrivateKeyHex | undefined {
  const raw = readOptional(env, name);
  if (raw === undefined) return undefined;
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    // Deliberately does not echo the value: this is key material.
    throw new Error(
      `${name} must be a 0x-prefixed 32-byte hex private key ` +
        `(66 characters). Got ${raw.length} characters.`,
    );
  }
  return raw as PrivateKeyHex;
}

export function loadConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ParleyConfig {
  const settlementMode = readEnum(
    env,
    "SETTLEMENT_MODE",
    SETTLEMENT_MODES,
    "local-stub",
  );
  const circleApiKey = readOptional(env, "CIRCLE_API_KEY");
  const circleEntitySecret = readOptional(env, "CIRCLE_ENTITY_SECRET");

  const buyerPrivateKey = readPrivateKey(env, "BUYER_PRIVATE_KEY");
  const sellerPrivateKey = readPrivateKey(env, "SELLER_PRIVATE_KEY");
  const sellerPayoutPrivateKey = readPrivateKey(
    env,
    "SELLER_PAYOUT_PRIVATE_KEY",
  );
  const sellerWalletAddress = readOptional(env, "SELLER_WALLET_ADDRESS");

  // Real settlement needs EVM private keys, NOT a Circle API key: GatewayClient
  // authenticates with `privateKeyToAccount` via viem. Verified against the
  // installed package, see docs/x402-sdk-verified-surface.md.
  //
  // Fail loudly rather than quietly falling back to the stub. Asking for real
  // settlement and silently getting a simulated one is how a fabricated
  // transaction hash reaches a submission video.
  if (settlementMode === "arc-x402") {
    const missing: string[] = [];
    if (buyerPrivateKey === undefined) missing.push("BUYER_PRIVATE_KEY");
    if (sellerWalletAddress === undefined) missing.push("SELLER_WALLET_ADDRESS");
    if (missing.length > 0) {
      throw new Error(
        `SETTLEMENT_MODE=arc-x402 requires ${missing.join(" and ")}. ` +
          `Run \`pnpm provision-wallets\` and fund the addresses, or use ` +
          `SETTLEMENT_MODE=local-stub to run against the stub adapter.`,
      );
    }
  }

  const llmMode = readEnum(env, "LLM_MODE", LLM_MODES, "off");
  const llmApiKey = readOptional(env, "LLM_API_KEY");
  if (llmMode !== "off" && llmApiKey === undefined) {
    throw new Error(
      `LLM_MODE=${llmMode} requires LLM_API_KEY. ` +
        `Set it in .env, or use LLM_MODE=off for templated rationales.`,
    );
  }

  return {
    settlementMode,
    settlementStubLatencyMs: readPositiveInteger(
      env,
      "SETTLEMENT_STUB_LATENCY_MS",
      800,
    ),
    circleApiKey,
    circleEntitySecret,
    buyerWalletAddress: readOptional(env, "BUYER_WALLET_ADDRESS"),
    sellerWalletAddress,
    sellerPayoutWalletAddress: readOptional(env, "SELLER_PAYOUT_WALLET_ADDRESS"),
    buyerPrivateKey,
    sellerPrivateKey,
    sellerPayoutPrivateKey,
    llmMode,
    llmApiKey,
    llmModel: readOptional(env, "LLM_MODEL") ?? "claude-sonnet-5",
  };
}

/**
 * True when the keys real settlement needs are present.
 *
 * That means EVM private keys, not a Circle API key: `GatewayClient`
 * authenticates through viem. See docs/x402-sdk-verified-surface.md.
 */
export function hasSettlementKeys(config: ParleyConfig): boolean {
  return (
    config.buyerPrivateKey !== undefined &&
    config.sellerWalletAddress !== undefined
  );
}

/**
 * True when Circle Developer-Controlled Wallets credentials are present.
 * Nothing in the critical path needs these; kept for the optional custody path.
 */
export function hasCircleCredentials(config: ParleyConfig): boolean {
  return (
    config.circleApiKey !== undefined && config.circleEntitySecret !== undefined
  );
}

/** Secret-free summary, safe to log at startup. */
export function describeConfig(config: ParleyConfig): string {
  return [
    `settlement=${config.settlementMode}`,
    `settlementKeys=${hasSettlementKeys(config) ? "present" : "absent"}`,
    `llm=${config.llmMode}`,
    config.llmMode === "off" ? null : `model=${config.llmModel}`,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
}
