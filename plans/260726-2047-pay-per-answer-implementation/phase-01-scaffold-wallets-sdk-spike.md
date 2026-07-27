# Phase 01: Scaffold, Wallets, SDK Spike

**Context:** [plan.md](plan.md) · `context/latest.md` · `circlefin/arc-nanopayments`
**Priority:** P0 (blocks everything)
**Status:** ☐ Not started
**Days:** Jul 26-27

## Overview

Stand up the monorepo, prove the x402 payment path end-to-end with one throwaway seller,
and confirm the SDK surface actually matches what research assumed.

## Key insights

- The SDK API in `context/latest.md` came from a **blog post, not the package**. Treat as
  UNVERIFIED. This phase's real job is to make it verified.
- Faucet drip (~1 USDC/day) is the throughput ceiling for the whole project. Start today.
- Circle's sample uses Supabase + LangChain. Copy only the x402 wiring and wallet topology.

## Requirements

**Functional**
- One buyer wallet, three seller wallets, one payout wallet on Arc Testnet.
- A throwaway seller endpoint returns 402, buyer pays, retries, gets 200. Proven on testnet.

**Non-functional**
- Secrets in `.env` only, never committed. `.gitignore` before first commit.
- TypeScript strict. Every package compiles via `pnpm -r build`.

## Architecture

```
pay-per-answer/
├── packages/
│   ├── shared/        # types, config, Arc constants, sqlite schema
│   └── wallets/       # Circle Developer-Controlled Wallet helpers
├── apps/
│   └── spike/         # throwaway 402 seller + buyer, deleted after phase 02
└── pnpm-workspace.yaml
```

Wallet topology (copied from Circle's sample; it makes the dashboard legible to judges):
buyer agent wallet · 3 per-provider seller wallets · 1 payout wallet.

## Related code files

**Create:** `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`,
`packages/shared/src/arc-network-constants.ts`, `packages/shared/src/types.ts`,
`packages/wallets/src/circle-wallet-client.ts`, `apps/spike/*`
**Delete (phase 02):** `apps/spike/`

## Implementation steps

1. `git init`; `.gitignore` (`.env`, `node_modules`, `*.db`) **before** the first commit.
2. Push to a public GitHub repo. **Submit Checkpoint 2 with the repo link; it is due today AoE.**
3. Request Arc Testnet USDC at `https://faucet.circle.com`. Set a daily reminder.
4. pnpm workspace + strict TS base config.
5. `packages/shared`: Arc constants (`eip155:5042002`, facilitator URL, USDC decimals), core types.
6. `packages/wallets`: create/fetch the 5 Developer-Controlled Wallets, log addresses.
7. `apps/spike`: minimal seller with `@circle-fin/x402-batching/server` at $0.001; buyer with
   `GatewayClient`. Run against Arc Testnet.
8. **Record the real SDK surface** (exact imports, middleware signature, client methods) into
   `packages/shared/src/x402-sdk-notes.md`. Phases 02/03 build against this, not the blog.
9. Probe for facilitator rate limits: 50 calls in a tight loop, log any 429/throttle.

## Todo

- [ ] git init + .gitignore + public repo pushed
- [ ] **Checkpoint 2 submitted (repo link + progress summary)**
- [ ] Faucet USDC requested; daily reminder set
- [ ] pnpm workspace + tsconfig base compiling
- [ ] 5 wallets created, addresses recorded in `.env`
- [ ] Spike: 402 → pay → 200 proven on Arc Testnet
- [ ] Real SDK surface documented
- [ ] Rate-limit probe run, result recorded

## Success criteria

A testnet transaction hash showing a $0.001 USDC payment that unlocked a real HTTP 200,
plus a written record of the true SDK API. Anything less and phase 02 is guesswork.

## Risk assessment

| Risk | Mitigation |
|---|---|
| SDK differs from blog | This phase exists to find out. If it diverges materially, stop and re-plan 02/03. |
| Faucet slower than 1 USDC/day | Request daily from day 1; if starved, drop per-call price to $0.0001. |
| Developer-Controlled Wallet setup needs Circle account approval | Start the signup immediately; it may gate everything. |

## Security

- Circle API key + entity secret in `.env`, gitignored, never logged.
- Testnet only. No mainnet keys anywhere in the repo.

## Next steps

Phase 02 replaces the spike with three real sellers.
