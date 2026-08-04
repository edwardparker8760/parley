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

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type SettlementMode = "local-stub" | "arc-x402";
export type LlmMode = "off" | "rationale-only" | "full" | "replay";

/** Which vendor the LLM layer talks to. Swapped in one place: the factory. */
export type LlmProvider = "gemini" | "anthropic";

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
  readonly llmProvider: LlmProvider;
  readonly llmApiKey: string | undefined;
  /** Empty string means "use the provider default from the factory". */
  readonly llmModel: string;
  readonly llmTimeoutMs: number;
  readonly llmTapePath: string;
  /**
   * Base URL of the seller's 402-protected service.
   *
   * Real settlement pays an HTTP resource, not an address, so `arc-x402` needs
   * somewhere to pay. Defaults to the local seller service.
   */
  readonly sellerServiceUrl: string;
}

const SETTLEMENT_MODES: readonly SettlementMode[] = ["local-stub", "arc-x402"];
const LLM_MODES: readonly LlmMode[] = ["off", "rationale-only", "full", "replay"];
const LLM_PROVIDERS: readonly LlmProvider[] = ["gemini", "anthropic"];

/**
 * Sentinels the scaffolded `.env` ships with.
 *
 * An unfilled placeholder means "this value is not set yet", which is a normal
 * state: the repo is designed to run with no credentials at all (stub
 * settlement, LLM_MODE=off). Treating a placeholder as a real value would make
 * every CLI crash the moment the scaffold is created, which is worse than
 * useless. A genuine typo still fails loudly, because it will not match one of
 * these exact strings.
 */
const PLACEHOLDER_VALUES: readonly string[] = [
  "PASTE_HERE",
  "PASTE_KEY_HERE",
];

function readOptional(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const raw = env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  if (PLACEHOLDER_VALUES.includes(trimmed)) return undefined;
  return trimmed;
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

/**
 * Load the repo-root `.env` into `process.env`, once, if it exists.
 *
 * Every CLI in this workspace runs with its cwd set to its own package
 * directory (pnpm --filter does that), so a repo-root `.env` is one to three
 * levels up depending on the entry point. Walking up to the directory holding
 * `pnpm-workspace.yaml` makes every entry point behave the same regardless of
 * where it was launched from.
 *
 * Deliberate choices:
 *   - No dotenv dependency. Node has `process.loadEnvFile` built in.
 *   - Absent file is fine, not an error. Running with no `.env` is a supported
 *     state: it selects the stub settlement adapter and LLM_MODE=off.
 *   - Real environment variables WIN. `loadEnvFile` does not overwrite keys
 *     already set, so CI and shell exports still take precedence over the file.
 */
let envFileLoaded = false;

function loadRepoRootEnvFileOnce(): void {
  if (envFileLoaded) return;
  envFileLoaded = true;

  let directory = resolve(process.cwd());
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(directory, "pnpm-workspace.yaml"))) {
      const envPath = join(directory, ".env");
      if (existsSync(envPath)) process.loadEnvFile(envPath);
      return;
    }
    const parent = dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}

export function loadConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ParleyConfig {
  // Only when reading the real environment. Tests pass an explicit env object
  // and must stay hermetic: a developer's local .env must never change a
  // test result.
  if (env === process.env) loadRepoRootEnvFileOnce();

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
  const llmProvider = readEnum(env, "LLM_PROVIDER", LLM_PROVIDERS, "gemini");
  const llmApiKey = readOptional(env, "LLM_API_KEY");

  // `replay` reads a recorded tape and needs no key: a tape is provider-
  // agnostic, so a recording survives a provider swap.
  const needsKey = llmMode === "rationale-only" || llmMode === "full";
  if (needsKey && llmApiKey === undefined) {
    throw new Error(
      `LLM_MODE=${llmMode} requires LLM_API_KEY. ` +
        `Set it in .env, use LLM_MODE=replay with a recorded tape, or ` +
        `LLM_MODE=off for templated rationales.`,
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
    llmProvider,
    llmApiKey,
    // Empty means "provider default". The model name lives in exactly one
    // place, DEFAULT_MODEL_BY_PROVIDER in the llm-layer factory, so a provider
    // swap does not leave a stale model string behind in config.
    llmModel: readOptional(env, "LLM_MODEL") ?? "",
    llmTimeoutMs: readPositiveInteger(env, "LLM_TIMEOUT_MS", 4000),
    llmTapePath: readOptional(env, "LLM_TAPE_PATH") ?? "docs/llm-tape.json",
    sellerServiceUrl:
      readOptional(env, "SELLER_SERVICE_URL") ?? "http://127.0.0.1:4021",
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
    config.llmMode === "off" ? null : `provider=${config.llmProvider}`,
    config.llmMode === "off" || config.llmModel === ""
      ? null
      : `model=${config.llmModel}`,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
}
