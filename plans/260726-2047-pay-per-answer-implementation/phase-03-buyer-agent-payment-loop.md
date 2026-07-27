# Phase 03: Buyer Agent + Payment Loop

**Context:** [plan.md](plan.md) · [phase-02](phase-02-seller-services-x402-paywall.md)
**Priority:** P0
**Status:** ☐ Not started
**Days:** Jul 29-30

## Overview

The agent that receives a job, pays a chosen provider over x402, records the outcome, and
scores the answer. Routing is a **stub** here (always pick `swift`); phases 04/05 replace it.

## Key insights

- Building the payment loop and the router separately keeps the router honest: it plugs into
  a `chooseProvider()` seam and nothing else changes.
- The **quality feedback loop is what makes "quality" real** rather than static config. Without
  post-hoc scoring, the router is just a price comparator and the submission is thin.

## Requirements

**Functional**
- `POST /ask { question, criticality }` → pays a provider, returns `{ answer, providerId, costUsdc, reason }`.
- Every attempt persisted: provider, price, latency, success/failure, quality score, timestamp.
- Post-hoc judge scores each answer 0-1; feeds the per-provider quality EWMA.
- Retry on provider failure with a *different* provider; never silently return an error.

**Non-functional**
- One `chooseProvider()` seam, stubbed now, swapped in phase 04. No other call sites.
- All spend recorded in integer micro-USDC. Never floats for money.

## Architecture

```
apps/buyer/
├── src/
│   ├── server.ts                   # POST /ask
│   ├── payment-client.ts           # GatewayClient wrapper: 402 → pay → retry → 200
│   ├── job-orchestrator.ts         # choose → pay → judge → record → retry-on-fail
│   ├── answer-quality-judge.ts     # LLM scores answer 0-1
│   └── choose-provider-stub.ts     # replaced in phase 04
packages/shared/src/
└── ledger-store.ts                 # sqlite: attempts, spend, quality EWMA
```

## Related code files

**Create:** `apps/buyer/src/*` (above), `packages/shared/src/ledger-store.ts`
**Modify:** `packages/shared/src/types.ts` (`JobRequest`, `AttemptRecord`, `Criticality`)

## Implementation steps

1. SQLite schema: `attempts` (job_id, provider_id, price_micro_usdc, latency_ms, ok,
   quality_score, tx_hash, created_at) and `provider_stats` (EWMA quality, EWMA latency,
   error rate, call count).
2. `payment-client.ts`: wrap `GatewayClient` to issue the request, catch 402, pay, retry once,
   surface the tx hash. Hard timeout; a hung payment must not hang the job.
3. `choose-provider-stub.ts`: return `swift` unconditionally, behind the real interface.
4. `job-orchestrator.ts`: choose → pay → on failure pick the next-best *different* provider
   (max 2 retries) → judge → persist.
5. `answer-quality-judge.ts`: LLM scores relevance/completeness 0-1. Cheap model, strict JSON
   output, default 0.5 on judge failure so a broken judge can't poison the EWMAs.
6. Update `provider_stats` EWMAs (α ≈ 0.3) after every attempt.
7. Seed a fixed 20-question benchmark set, a deterministic input for demos and comparisons.

## Todo

- [ ] SQLite schema + `ledger-store.ts`
- [ ] Payment client: 402 → pay → 200 with timeout + tx hash
- [ ] `chooseProvider()` interface + stub
- [ ] Orchestrator with cross-provider retry
- [ ] Quality judge + EWMA updates
- [ ] 20-question benchmark set
- [ ] 20 jobs run end-to-end, all attempts persisted with tx hashes

## Success criteria

20 benchmark questions answered and paid for on Arc Testnet, every attempt in SQLite with a
real tx hash, per-provider quality EWMAs diverging in the direction you'd expect.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Faucet balance exhausted mid-run | 20 jobs ≈ $0.02-0.10. Fine. Watch it once the dashboard loops. |
| Judge scores are noise | Fixed benchmark set + fixed judge prompt. Sanity-check that `deep` > `frugal-degraded`. |
| Payment hangs | Hard timeout, treated as provider failure, triggers retry on another provider. |

## Security

- Buyer wallet key via Circle Developer-Controlled Wallets; never a raw private key in code.
- `/ask` rate-limited; an open endpoint spends real testnet USDC.

## Next steps

Phase 04 replaces the stub with deterministic scoring.
