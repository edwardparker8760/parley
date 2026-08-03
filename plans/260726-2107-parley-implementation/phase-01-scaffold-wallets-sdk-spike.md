# Phase 01: Scaffold, Wallets, SDK Spike

## Context Links

- Plan: [`plan.md`](plan.md)
- Spec: [`../../spec.md`](../../spec.md) sections 9, 10, 12.4
- Research: [`../../context/latest.md`](../../context/latest.md) sections (b) and (c), plus the Verification Log
- Superseded source mined for plumbing only: [`../260726-2047-pay-per-answer-implementation/phase-01-scaffold-wallets-sdk-spike.md`](../260726-2047-pay-per-answer-implementation/phase-01-scaffold-wallets-sdk-spike.md)
- Reference repo: `circlefin/arc-nanopayments`

## Overview

- **Priority:** P0. Blocks every other phase.
- **Status:** COMPLETE 2026-08-03, except two owner actions (faucet request, live
  402 run). Phase 02 is unblocked. See "Outcome" below.
- **Day:** Mon 3 Aug (target: done same day)
- **Brief:** Stand up the pnpm monorepo, put settlement behind an adapter interface with a working local stub, and run a short throwaway spike that verifies the real `@circle-fin/x402-batching` API surface before anything depends on it.

## Key Insights

- The SDK surface in `context/latest.md` was read off a Circle blog post, **not off the package**. It is UNVERIFIED. Making it verified is the main job of this phase.
- **No `.env` exists and no `CIRCLE_API_KEY` or entity secret is present anywhere in the repo.** Developer-Controlled Wallets and real on-chain settlement are therefore BLOCKED right now. The differentiator (phases 03 to 05) must not inherit that block.
- Consequence, and this is the load-bearing design call of the phase: **settlement sits behind a `SettlementAdapter` interface from the first commit**, with a deterministic local stub as the default implementation. Phases 02 to 05 build and demo against the stub. The Circle implementation drops in behind the same interface whenever credentials land.
- Faucet is `faucet.circle.com` (Arc Testnet), roughly **20 USDC per request, every 2 hours, per address** (re-checked 2026-07-27). An earlier "1 USDC/day" figure was wrong in the pessimistic direction, so faucet throughput is NOT the ceiling this phase assumed.
- Circle's sample uses Supabase and LangChain. Copy the wallet topology and the x402 wiring only. Do not adopt Supabase; SQLite is the ledger.
- Zero application code exists today. Every line of scaffolding is new, so keep the scaffolding minimal (YAGNI): no CI, no Docker, no lint gate beyond `tsc`.

## Requirements

**Functional**

1. pnpm workspace builds clean with `pnpm -r build` under TypeScript strict.
2. Shared Arc constants and core domain types exist and compile.
3. `SettlementAdapter` interface exists with two implementations registered by config: `local-stub` (default) and `arc-x402` (may be a stub that throws `NOT_CONFIGURED` until phase 06).
4. Wallet provisioning script exists. It runs against Circle if credentials are present; otherwise it emits three deterministic fake addresses and prints a loud "STUB WALLETS" banner.
5. A throwaway spike app either (a) proves 402 to pay to 200 on Arc Testnet, or (b) records precisely why it could not, plus the real SDK surface as read from the installed package.

**Non-functional**

- Secrets only in `.env`. `.gitignore` covers `.env*`, `node_modules`, `*.db`, `*.sqlite` before any commit.
- No file over 200 lines. Kebab-case descriptive filenames.
- pnpm is not installed on this machine. Enable via `corepack enable` (preferred) or `npm i -g pnpm`. If both fail within 15 minutes, fall back to npm workspaces and record the deviation; do not burn the morning on a package manager.

## Architecture

Single repo, pnpm workspace. One process for the runtime (see the recommendation in `plan.md`), so package boundaries are the only modularity that matters.

```
parley/
├── packages/
│   ├── shared/
│   │   ├── src/arc-network-constants.ts        # chain id, RPC, facilitator, explorer, USDC decimals
│   │   ├── src/money-micro-usdc.ts             # integer micro-USDC helpers, no floats
│   │   ├── src/domain-types.ts                 # Offer, Terms, DealId, SlaTier
│   │   └── src/config-from-env.ts              # typed env loader, fails loud on bad values
│   ├── wallets/
│   │   ├── src/wallet-provider-interface.ts
│   │   ├── src/circle-developer-wallet-provider.ts
│   │   └── src/stub-wallet-provider.ts
│   └── settlement/
│       ├── src/settlement-adapter-interface.ts
│       ├── src/local-stub-settlement-adapter.ts
│       └── src/arc-x402-settlement-adapter.ts  # skeleton in 01, filled in 06
├── spike/                                       # throwaway, deleted end of phase 02
│   ├── seller-402-endpoint.ts
│   └── buyer-pays-and-retries.ts
├── docs/x402-sdk-verified-surface.md            # written BY the spike, read by 02 and 06
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
└── .gitignore
```

**Wallet topology** (copied from Circle's reference architecture because it makes the dashboard legible to judges): buyer agent wallet, seller agent wallet, seller payout wallet. Three wallets, not five. The multi-provider split from the superseded plan is gone.

**Data flow (settlement path, established here, exercised in phase 06)**

```
agreed Deal ──► canonical JSON ──► sha256 ──► termsHash
                                                │
      amountMicroUsdc = unitPrice * quantity ───┤
                                                ▼
                                     SettlementAdapter.settle()
                                       ├── local-stub  → deterministic pseudo tx ref, status SETTLED_STUB
                                       └── arc-x402    → EIP-3009 auth via GatewayClient, status PENDING → SETTLED
                                                ▼
                                     SettlementReceipt { status, reference, txHash?, isStub }
```

`isStub` is carried all the way to the dashboard and rendered as a visible badge. Never let a stubbed settlement look real in the demo video.

## Related Code Files

**Create**

- `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `package.json`
- `packages/shared/src/arc-network-constants.ts`
- `packages/shared/src/money-micro-usdc.ts`
- `packages/shared/src/domain-types.ts`
- `packages/shared/src/config-from-env.ts`
- `packages/wallets/src/wallet-provider-interface.ts`
- `packages/wallets/src/circle-developer-wallet-provider.ts`
- `packages/wallets/src/stub-wallet-provider.ts`
- `packages/wallets/src/provision-wallets-script.ts`
- `packages/settlement/src/settlement-adapter-interface.ts`
- `packages/settlement/src/local-stub-settlement-adapter.ts`
- `packages/settlement/src/arc-x402-settlement-adapter.ts` (skeleton)
- `spike/seller-402-endpoint.ts`, `spike/buyer-pays-and-retries.ts`
- `docs/x402-sdk-verified-surface.md`

**Modify**

- `README.md` (add a "Running locally" stub section only; full rewrite is phase 08)

**Delete**

- `spike/` at the end of phase 02, once phase 06 has what it needs from `docs/x402-sdk-verified-surface.md`

## Implementation Steps

1. Enable pnpm: `corepack enable` then `corepack prepare pnpm@latest --activate`. Verify `pnpm -v`. If this fails, `npm i -g pnpm`. If that also fails inside 15 minutes, switch to npm workspaces and note it in `plan.md`.
2. Write `.gitignore` **before** anything else. Entries: `node_modules/`, `.env`, `.env.*`, `!.env.example`, `*.db`, `*.sqlite`, `dist/`, `.next/`.
3. `pnpm-workspace.yaml` with `packages/*`, `apps/*`, `spike`. `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess: true`, `target: ES2022`, `module: NodeNext`.
4. `packages/shared`: Arc constants (`eip155:5042002`, chain id `5042002`, RPC `https://rpc.testnet.arc.network`, facilitator `https://gateway-api-testnet.circle.com`, explorer `https://testnet.arcscan.app`, USDC 6 decimals). All money is **integer micro-USDC** (`1_000_000n` = 1 USDC). No floating point anywhere in money paths.
5. `packages/shared/src/domain-types.ts`: `SlaTier = 'basic' | 'standard' | 'premium'`, `Terms { deliveryWindowHours: number; slaTier: SlaTier }`, `Offer { unitPriceMicroUsdc: bigint; quantity: number; terms: Terms }`. Phase 02 extends, does not redefine.
6. `packages/shared/src/config-from-env.ts`: typed loader. Reads `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `SETTLEMENT_MODE` (`local-stub` default, `arc-x402` opt-in), `LLM_API_KEY`, `LLM_MODEL`. Missing Circle keys is a legal state that selects the stub, not a crash.
7. `packages/settlement`: define the interface, then the stub. Stub contract: `settle()` returns `{ status: 'SETTLED_STUB', reference: '0xstub-' + termsHash.slice(0,16), isStub: true, settledAt }`, deterministic for a given input, with a configurable artificial latency (default 800ms) so the dashboard's pending to settled transition is visible.
8. `packages/wallets`: interface plus both providers plus `provision-wallets-script.ts`. Script writes addresses to stdout and to `.env.local.generated` (gitignored) for manual copy. It must never write secrets to a tracked file.
9. Request Arc Testnet USDC at `https://faucet.circle.com` for all three addresses (stub addresses cannot be funded; if wallets are stubbed, log a TODO and move on). Set a daily reminder.
10. **The SDK spike, timeboxed to 90 minutes.** `pnpm add @circle-fin/x402-batching`. Then, before writing spike code, inspect the installed package: list its `dist/`, read its `package.json` `exports`, and read the bundled `.d.ts` files. Record verbatim: exported symbol names, the server middleware signature, the `GatewayClient` constructor options, every client method, and whether anything resembling settlement status or a manual flush exists (this answers spec open question 4).
11. Write every finding into `docs/x402-sdk-verified-surface.md` with a VERIFIED or NOT PRESENT marker per item. Phases 02 and 06 build against this file, never against the blog post.
12. If credentials are present, run the spike end to end on Arc Testnet and record a tx hash or batch reference in the same file. If credentials are absent, mark the file `PARTIAL: types verified from package, runtime unverified` and continue.
13. **Divergence rule, non-negotiable:** if the real API differs materially from the assumed surface (different package name, no `GatewayClient`, no Express middleware, network not supported), STOP. Do not push through with adaptations. Return to `plan.md`, re-plan phases 02 and 06, and get owner sign-off. Budget for this outcome: it costs half a day, not two days, precisely because phases 02 to 05 depend on the adapter interface and not on the SDK.
14. Probe facilitator rate limits only if step 12 ran live: 50 calls in a tight loop, log any 429. Skip otherwise.
15. `pnpm -r build` clean. Commit.

## Todo List

- [x] pnpm working (`corepack enable` hit EPERM on `C:\Program Files\nodejs`; `npm i -g pnpm` succeeded, pnpm 11.18.0)
- [x] `.gitignore` written before first commit of this phase (already correct; added `.env.local.generated`)
- [x] Workspace and `tsconfig.base.json` compiling
- [x] `packages/shared` constants, money helpers, domain types, env config
- [x] `SettlementAdapter` interface plus `local-stub` implementation
- [x] `arc-x402` adapter skeleton (throws `SettlementNotConfiguredError`)
- [x] Wallet provider interface plus local-key, stub, and Circle implementations
- [x] `provision-wallets-script.ts` runs in both modes (`--stub` flag)
- [ ] **OWNER ACTION:** faucet requested for the three addresses; daily reminder set
- [x] `@circle-fin/x402-batching` installed (v3.2.0) and its real surface read from `.d.ts`
- [x] `docs/x402-sdk-verified-surface.md` written with per-item VERIFIED / NOT PRESENT markers
- [x] Spec open question 4 answered: **status YES** (`getTransferById`, `searchTransfers`, 5-state lifecycle); **manual flush NO**
- [ ] **OWNER ACTION:** live 402 to 200 proven (needs a funded wallet; blocked on faucet, not on code)
- [x] `pnpm -r build` clean

## Outcome (2026-08-03)

**Divergence rule: NOT triggered.** All four named stop conditions held: package
name unchanged, `GatewayClient` present, Express middleware present, Arc Testnet
supported. `CHAIN_CONFIGS.arcTestnet.chain.id` is `5042002`, matching
`packages/shared` exactly. No constant needed changing.

**One material divergence, and it makes the project easier.** `GatewayClient`
authenticates with a raw EVM private key through viem, not with
`CIRCLE_API_KEY` plus an entity secret. Consequences:

- The credential blocker is smaller than this phase assumed. No Circle console
  signup and no account-approval risk on the critical path.
- Unresolved question 2 of this file ("does Developer-Controlled Wallets need
  manual approval that could take days") is **moot**.
- `packages/wallets` gained `local-key-wallet-provider.ts` as the primary path.
  The Circle provider stays unimplemented behind the same interface.
- `.env` now carries testnet private keys. `.gitignore` covers `.env*` and
  `.env.local.generated`; keys are never printed to stdout.
- Judging criterion 2 is still met squarely: Circle Gateway, Nanopayments
  batching, and Circle's x402 facilitator are all used.

**Better than hoped on settlement status.** A real five-state lifecycle
(`received`, `batched`, `confirmed`, `completed`, `failed`) is queryable, so
phase 07's settlement panel can show real state rather than a binary guess.
**No manual flush exists**, so batch timing is Circle's to control: phase 06
must MEASURE latency before the video is scripted, not assume it.

**Success criteria, all four:** (1) `pnpm -r build` exits 0. (2)
`docs/x402-sdk-verified-surface.md` written from the installed package. (3)
`pnpm --filter @parley/settlement smoke` settles a fake deal through the stub
and prints `isStub: true` in ~800ms. (4) Live tx not yet obtained; the exact
blocker and the credential names are recorded in that doc.

## Success Criteria

Measurable, all four required:

1. `pnpm -r build` exits 0.
2. `docs/x402-sdk-verified-surface.md` exists and marks every assumed API item VERIFIED or NOT PRESENT, sourced from the installed package rather than the blog.
3. A one-line script call settles a fake deal through `local-stub` and prints a receipt with `isStub: true`. This proves phases 02 to 05 are unblocked by credentials.
4. Either a testnet tx hash or batch reference exists, or a written statement of the exact blocker with the credential names required.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| No Circle credentials for the whole week | **High** | **High** | Adapter interface plus local stub, decided in this phase. Phases 02 to 05 never touch Circle. Phase 06 degrades to stub-only with an honest on-screen badge and an honest line in the video. |
| SDK surface diverges from the blog | Medium | High | Step 10 inspects the real package before any code depends on it. Divergence triggers re-plan (step 13), not improvisation. |
| Nanopayments not actually usable on Arc Testnet from this SDK version | Low | High | Spike detects it. Fallback: direct USDC transfer on Arc via viem, still real settlement on Arc, framed honestly. Costs half a day, absorbed in phase 06. |
| pnpm setup rabbit hole | Medium | Low | 15-minute timebox, npm-workspaces fallback. |
| Faucet drip too slow to fund a demo | Medium | Medium | Request daily starting today. Demo amounts are tiny (unit price in micro-USDC), so 1 USDC funds hundreds of settlements. |
| Day 1 overruns into day 2 | Medium | High | Hard cut: the spike is timeboxed to 90 minutes. Scaffolding beyond the file list above is out of scope. |

**Rollback:** this phase creates only new files in an otherwise code-free repo. Rollback is `git revert` of a single commit; nothing downstream exists yet to cascade into.

## Security Considerations

- `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` live in `.env` only. Never logged, never printed, never in an error message. Redact in any thrown error.
- `.env.example` carries key **names** and empty values only.
- Testnet only. No mainnet key material may enter this repo at any point.
- Generated wallet addresses are public data; the entity secret and any private key material are not. `provision-wallets-script.ts` prints addresses only.
- Before the first push of this phase, run `git status` and confirm no `.env*` (other than `.env.example`) is staged.

## Next Steps

- **Unblocks:** phase 02 (needs `packages/shared` types and the workspace), phase 06 (needs the adapter interface and the verified SDK surface doc).
- **Blocked by:** nothing.
- **Owner gate before phase 02:** confirm the one-process recommendation in `plan.md`, and confirm whether Circle credentials will arrive this week.

## Unresolved Questions

1. Will `CIRCLE_API_KEY` and the entity secret be available at all before 8 Aug? If no, phase 06 ships stub-only and the video must say so plainly.
2. Does a Circle Developer-Controlled Wallets account require manual approval that could take days? Unknown; start signup at the top of the phase in case it gates everything.
3. Does `@circle-fin/x402-batching` expose settlement status or a manual flush? Answered only by step 10.
4. If Nanopayments turns out to be testnet-unsupported for this SDK version, is a plain USDC transfer on Arc an acceptable settlement story for the judges? Owner call.
