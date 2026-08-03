# `@circle-fin/x402-batching`: verified API surface

**Package:** `@circle-fin/x402-batching@3.2.0` (latest as of this run)
**Verified:** 2026-08-03, phase 01 spike
**Method:** read from the INSTALLED package (`dist/*.d.ts`, plus runtime export
enumeration via `spike/src/inspect-x402-sdk-surface.ts`). Not from a blog post.
**Status:** COMPLETE for types and static config. Runtime 402-to-200 flow is
UNVERIFIED (no funded key yet); see "Not yet verified" at the bottom.

Phases 02 and 06 build against THIS file. They do not build against
`context/latest.md` section (b), which was sourced from Circle's blog and is
superseded wherever the two disagree.

---

## Verdict

**No stop-and-re-plan trigger fired.** The phase-01 divergence rule named four
material divergences: different package name, no `GatewayClient`, no Express
middleware, network not supported. **None of them occurred.** One meaningful
divergence did occur, in the authentication model, and it makes the project
simpler rather than harder. See "Divergence" below.

---

## Per-item verification

| Assumed (from research) | Status | Reality |
|---|---|---|
| Package `@circle-fin/x402-batching` | **VERIFIED** | Exists, v3.2.0, Apache-2.0, by Circle Internet Financial |
| Buyer-side `GatewayClient` | **VERIFIED, moved** | Exists, but exported from `@circle-fin/x402-batching/client`, NOT the root |
| Seller-side Express middleware | **VERIFIED** | `createGatewayMiddleware()` from `/server`, returns `.require('$0.01')` middleware |
| Facilitator `https://gateway-api-testnet.circle.com` | **VERIFIED, not default** | Accepted as `facilitatorUrl`. The DEFAULT is **mainnet** `https://gateway-api.circle.com`. Testnet must be passed explicitly. |
| Network `eip155:5042002` (Arc Testnet) | **VERIFIED** | `CHAIN_CONFIGS.arcTestnet.chain.id === 5042002`, matches `packages/shared` |
| EIP-3009 authorizations, batched off chain | **VERIFIED** | `BatchEvmScheme` signs EIP-3009 `TransferWithAuthorization` via EIP-712 against the GatewayWallet contract, not the USDC contract |
| Auth via `CIRCLE_API_KEY` + entity secret | **NOT PRESENT** | See "Divergence". `GatewayClient` takes a raw EVM private key. |
| Settlement status readable | **VERIFIED** | `getTransferById(id)`, `searchTransfers(params)` |
| Manual batch flush | **NOT PRESENT** | No flush, force-settle, or submit-batch method exists |

## Arc Testnet configuration, read from `CHAIN_CONFIGS.arcTestnet`

| Field | Value |
|---|---|
| Gateway domain | `26` (`GATEWAY_DOMAINS.arcTestnet`) |
| `chain.id` | `5042002` |
| `chain.name` | `Arc Testnet` |
| `rpcUrl` | `https://rpc.testnet.arc.network` |
| USDC | `0x3600000000000000000000000000000000000000` |
| GatewayWallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| GatewayMinter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |

Every one of these matches what `packages/shared/src/arc-network-constants.ts`
already carries. No constant needs changing.

## Exports, enumerated at runtime

**Root (`@circle-fin/x402-batching`)**, detection helpers only:
`supportsBatching`, `isBatchPayment`, `getVerifyingContract`,
`CIRCLE_BATCHING_NAME`, `CIRCLE_BATCHING_SCHEME`, `CIRCLE_BATCHING_VERSION`,
`GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS`, `ARC_PRIVATE_MAINNET_HEADER`,
`arcPrivateMainnetHeaders`.

**`/client`** (9): `GatewayClient`, `BatchEvmScheme`, `CompositeEvmScheme`,
`registerBatchScheme`, `CHAIN_CONFIGS`, `GATEWAY_DOMAINS`,
`GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS`, `ARC_PRIVATE_MAINNET_HEADER`,
`arcPrivateMainnetHeaders`.

**`/server`** (5): `createGatewayMiddleware`, `BatchFacilitatorClient`,
`GatewayEvmScheme`, `isBatchPayment`,
`GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS`.

## DIVERGENCE: the authentication model

**Assumed:** Circle Developer-Controlled Wallets, authenticated with
`CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET`.

**Actual:**

```ts
interface GatewayClientConfig {
  chain: SupportedChainName;   // 'arcTestnet'
  privateKey: Hex;             // raw EVM private key, used with viem
  rpcUrl?: string;
  arcPrivateMainnet?: boolean;
}
```

`GatewayClient` builds a viem account with `privateKeyToAccount(privateKey)`.
There is no API key, no entity secret, and no Circle account anywhere in the
payment path.

**Consequences, all favourable:**

1. **The credential blocker is smaller than the plan assumed.** No Circle
   console signup, no entity-secret registration, and no risk of an account
   approval taking days. What phase 06 needs is a funded EVM private key.
2. **Wallet provisioning is local and instant**: generate three keypairs with
   viem, fund the addresses from the faucet. `packages/wallets` should offer a
   local-key provider as the primary path.
3. **`CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` are not needed for
   settlement.** They stay in `.env.example` only because Developer-Controlled
   Wallets remain an option for a custody story; nothing in the critical path
   reads them.
4. Judging criterion 2 ("clear use of Circle's developer tools") is still met
   squarely: Circle Gateway, Nanopayments batching, and Circle's x402
   facilitator are all used. Developer-Controlled Wallets were never required.

**Security consequence, and it is the real cost:** a raw private key now lives
in `.env`. Testnet only, funded with faucet USDC worth nothing, never reused
anywhere else, never logged, never committed. `.gitignore` already covers
`.env*` and `*.key`.

## Spec open question 4, ANSWERED

> Does `@circle-fin/x402-batching` expose settlement status or a manual flush?

**Settlement status: YES.**

```ts
type TransferStatus = 'received' | 'batched' | 'confirmed' | 'completed' | 'failed';

getTransferById(id: string): Promise<TransferResponse>;
searchTransfers(params?: SearchTransfersParams): Promise<SearchTransfersResponse>;
```

`SearchTransfersParams` filters on `from`, `to`, `network`, `status`, `token`,
`startDate`, `endDate`, with cursor pagination. `TransferResponse` carries
`id`, `status`, `amount`, `fromAddress`, `toAddress`, `createdAt`, `updatedAt`.

This is better than the plan hoped for. The dashboard settlement panel can show
a real five-state lifecycle polled from Circle rather than a binary
pending/settled guess, and phase 06 can measure genuine settlement latency by
polling `received` to `completed`.

**Manual flush: NO.** No method forces a batch to settle. Batch timing is
Circle's to control and cannot be driven from our side. The only related
methods are `initiateTrustlessWithdrawal` and `completeTrustlessWithdrawal`,
which are explicitly documented as emergency-only with a roughly 7-day delay,
and are irrelevant here.

**Consequence for the demo video:** settlement latency is not ours to
control, so it must be MEASURED in phase 06 before the video is scripted, not
assumed. If a batch takes minutes, the video shows the authorization landing
immediately and the settlement confirming later, which is the honest framing
anyway (`context/latest.md` section (e) item 3).

## Buyer path, as it actually is

```ts
import { GatewayClient } from "@circle-fin/x402-batching/client";

const gateway = new GatewayClient({ chain: "arcTestnet", privateKey });

await gateway.deposit("1.0");                 // one time: wallet -> Gateway balance
const { data, amount, transaction } = await gateway.pay(url);  // handles 402 automatically
const balances = await gateway.getBalances(); // wallet + gateway, total/available/withdrawing/withdrawable
await gateway.withdraw("0.5");                // same chain is instant
```

`pay()` runs the whole flow: request, receive 402, find the Gateway batching
option, sign the authorization, retry with a `Payment-Signature` header. It
returns `PayResult { data, amount, formattedAmount, transaction, status }`.

`supports(url)` checks whether an endpoint offers Gateway batching before
paying, which is a cheap precondition check worth using in phase 06.

## Seller path, as it actually is

```ts
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";

const gateway = createGatewayMiddleware({
  sellerAddress: "0x...",
  networks: ["eip155:5042002"],                       // omit to accept all chains
  facilitatorUrl: "https://gateway-api-testnet.circle.com",  // REQUIRED: default is mainnet
});

app.post("/capacity", gateway.require("$0.001"), handler);
```

Price is a dollar string (`'$0.001'`), not micro-USDC, so the boundary between
Parley's integer micro-USDC arithmetic and this SDK needs one explicit
conversion. Put it in the adapter, not in the engine.

The middleware also exposes lifecycle hooks (`onProtectedRequest`,
`onBeforeVerify`, `onAfterVerify`, `onVerifyFailure`, `onBeforeSettle`,
`onAfterSettle`, `onSettleFailure`, `onVerifiedPaymentCanceled`).
`onAfterSettle` is the natural place to write a settlement row into the SQLite
ledger.

## Peer dependencies, NOT auto-installed

```
@x402/core  ^2.3.0   (required)
@x402/evm   ^2.3.0   (optional per package.json, but /server imports
                      @x402/evm/exact/server, so it is required in practice)
viem        ^2.0.0   (required)
```

pnpm does not install peers automatically. Any package that imports the SDK
must declare all three itself, or `/server` will fail to resolve at runtime.

## Not yet verified

1. **Live 402 to 200 on Arc Testnet.** Needs a funded private key. Blocked on
   faucet funding, not on code. Phase 06 step 1.
2. **Real settlement latency** (`received` to `completed`). Must be measured,
   see above.
3. **Facilitator rate limits on testnet.** Not probed; the probe requires a
   live key. Still open from `context/latest.md` section (f) item 5.
4. **Whether the faucet funds a locally generated keypair** as readily as a
   Circle-managed wallet address. Expected yes, unverified.

## Unresolved questions

1. Should `packages/wallets` keep the Circle Developer-Controlled Wallets
   provider at all, given nothing in the critical path needs it? Leaning:
   keep the interface, add a viem local-key provider as the default, and leave
   the Circle provider unimplemented rather than deleting it.
2. ~~Does the Arc Testnet faucet rate-limit per address or per requester?~~
   **ANSWERED 2026-07-27:** roughly 20 USDC per request, every 2 hours, PER
   ADDRESS. Faucet throughput is not a project constraint.
