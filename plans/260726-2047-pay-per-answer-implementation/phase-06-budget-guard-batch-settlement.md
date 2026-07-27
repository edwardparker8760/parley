# Phase 06: Budget Guard + Batch Settlement

**Context:** [plan.md](plan.md) · [phase-05](phase-05-router-llm-decision-layer.md)
**Priority:** P1 (completes the "programmable money" story)
**Status:** ☐ Not started
**Days:** Aug 3-4

## Overview

Enforce a real daily USDC budget with a hard stop, and surface x402 batch settlement: pending
micro-payments aggregating into on-chain settlements.

## Key insights

- Phase 04 makes the router *feel* budget pressure; this phase makes the budget *binding*.
  Soft pressure without a hard ceiling is not a budget.
- Batch settlement is Arc-specific and worth showing, but it introduces demo timing risk
  (payments pending, not settled, when the camera is rolling). **Spike the timing here**, before
  the video is scripted in phase 08.

## Requirements

**Functional**
- Configurable daily budget in micro-USDC, resetting at UTC midnight.
- Spend is reserved *before* the call and reconciled after, so concurrency cannot cause overspend.
- At the cap: return 402 to the client with a clear "daily budget exhausted" body. Never
  silently degrade to a free answer.
- Track pending vs settled amounts per provider; expose settlement state and tx hashes.
- Manual "settle now" trigger for the demo, if the SDK exposes one.

**Non-functional**
- Integer micro-USDC everywhere. No floats for money.
- Budget check and reservation atomic w.r.t. concurrent jobs.

## Architecture

```
packages/shared/src/
├── budget-guard.ts            # reserve → commit/release, daily reset, hard cap
└── settlement-tracker.ts      # pending vs settled per provider, tx hashes
```

Reserve/commit avoids the classic race: N concurrent jobs each seeing budget remaining and
all proceeding past the cap.

## Related code files

**Create:** `packages/shared/src/budget-guard.ts`, `settlement-tracker.ts`
**Modify:** `apps/buyer/src/job-orchestrator.ts` (reserve/commit around payment),
`packages/router/src/budget-pressure.ts` (read live budget state)

## Implementation steps

1. `budget-guard.ts`: `reserve(amount)` → `commit(id)` / `release(id)`. SQLite transaction or
   a single-process mutex. Daily reset at UTC midnight.
2. Orchestrator: reserve before payment, commit on success, release on failure.
3. Cap behaviour: 402 + explicit reason to the client. Log it as a first-class event; the
   dashboard should show the moment the agent stops spending.
4. `settlement-tracker.ts`: poll or subscribe to the facilitator for settlement state; record
   pending vs settled per provider with tx hashes.
5. **Timing spike:** measure how long a batch takes to settle on Arc Testnet. Record it.
   This determines whether the video shows live settlement or a pre-warmed state.
6. Optional manual settle trigger if the SDK supports it; otherwise the dashboard shows
   pending honestly and the video is scripted around the real latency.
7. Concurrency test: 50 parallel jobs against a budget that allows 10. Exactly 10 must pay.

## Todo

- [ ] Budget guard with reserve/commit/release + daily reset
- [ ] Orchestrator wired to reserve/commit
- [ ] Hard-cap 402 path with clear client message
- [ ] Settlement tracker: pending vs settled + tx hashes
- [ ] **Batch settlement timing measured and written down**
- [ ] Concurrency test passing (no overspend)
- [ ] Router reads live budget state for pressure

## Success criteria

Set a $0.01 daily budget, fire 50 concurrent jobs: the agent spends up to the cap, not a
micro-USDC over, then refuses cleanly, and the dashboard shows pending payments converging
into settled ones with real tx hashes.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Settlement too slow for a 3-min video | This is why we measure it here, not in phase 08. Pre-warm state or script around it. |
| Overspend under concurrency | Reserve-before-call + the 50-vs-10 test. |
| Facilitator exposes no settlement visibility | Fall back to tracking buyer wallet balance deltas on-chain; less elegant, still real. |

## Security

- Budget cap is the only thing between a bug and a drained wallet. Test it before any long run.
- `/ask` rate limit must hold independently of the budget guard.

## Next steps

Phase 07 renders all of this.

## Unresolved

- Does `@circle-fin/x402-batching` expose settlement status and a manual flush? Unknown until
  the phase-01 SDK spike. If not, step 6 is dropped.
