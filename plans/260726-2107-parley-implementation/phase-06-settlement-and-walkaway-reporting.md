# Phase 06: Settlement on Accept and Walk-Away Reporting

## Context Links

- Plan: [`plan.md`](plan.md)
- Spec: [`../../spec.md`](../../spec.md) section 6
- Depends on: [`phase-01-scaffold-wallets-sdk-spike.md`](phase-01-scaffold-wallets-sdk-spike.md) (adapter interface, verified SDK surface), [`phase-04-deterministic-negotiation-utility-concession-zopa.md`](phase-04-deterministic-negotiation-utility-concession-zopa.md) (post-mortem payload)
- SDK truth source: `docs/x402-sdk-verified-surface.md` (written in phase 01)

## Overview

- **Priority:** P1. **Folded to minimum viable form.** Judging criterion 2 (clear use of Circle tools) needs this to exist; it does not need it to be elaborate.
- **Status:** **COMPLETE-ON-STUB 2026-08-03.** All three minimum success criteria met. The
  credential gate (step 8) closed NEGATIVE: no wallet is provisioned (every key in `.env` is
  still the `.env.example` placeholder), so steps 9 to 12 did not run and the `arc-x402` adapter
  remains a throwing skeleton. Phase 07 is unblocked and inherits the reclaimed time.
  - **Deviation from the plan, deliberate:** no `packages/reporting` was created. The
    post-mortem builder lives in `packages/orchestrator/src/build-walkaway-report.ts` because
    the orchestrator is already the sanctioned observer (it is the only place allowed to import
    the ZOPA oracle), and the repositories live in `packages/ledger` with every other table.
    One fewer package, no new dependency edges.
- **Day:** Fri 7 Aug, afternoon
- **Brief:** On `ACCEPT`, settle `unitPrice * quantity` in USDC on Arc with the agreed terms hashed into the payment reference. On `WALK_AWAY`, emit both structured post-mortems. No batch-flush UI, no retry orchestration, no settlement state machine beyond three states.

## Key Insights

- **Circle credentials are the gating risk for this phase and only this phase.** Because phase 01 put settlement behind `SettlementAdapter` with a working local stub, phases 02 to 05 (the differentiator) are already complete and demoable regardless of what happens here. This phase is where the credential risk is finally cashed in, and its scope is deliberately small so that cashing it in late is survivable.
- **Honesty rule, absolute:** if settlement runs on the stub, the dashboard shows a `SIMULATED` badge and the video says so. A fake tx hash presented as real is a disqualifying integrity problem, and judges on a Circle hackathon will check the explorer.
- Payments are EIP-3009 authorisations settled in **batches**, not instant per-call on-chain transfers (research section e, item 3). The correct vocabulary is "authorisation issued, then batch settled". Do not claim "payment confirmed on-chain" per deal.
- Walk-away reporting costs almost nothing because phase 04 already produces the structured payload. It is the cheapest deliverable in the plan and it carries scenario C, which is the non-negotiable demo. **Build the walk-away path first, before touching Circle**, so that if settlement collapses, the scenario C story is already safe.
- Measure real settlement latency here, before the video is scripted (per `plan.md` phase 06 intent). If a batch takes 40 seconds, the video needs a cut, not a surprise.

## Requirements

**Functional**

1. `computeTermsHash(deal) -> string`: sha256 over a **canonical** JSON serialisation (sorted keys, prices as decimal strings, no whitespace) of `{ negotiationId, unitPriceMicroUsdc, quantity, terms, acceptedSeq }`.
2. On `ACCEPT`, the orchestrator creates a `Deal` row, computes `amountMicroUsdc = unitPrice * quantity` in bigint, and calls `SettlementAdapter.settle()`.
3. Three settlement states only: `PENDING`, `SETTLED`, `FAILED`. Plus the `isStub` boolean. Resist a fourth state.
4. `ArcX402SettlementAdapter` implements the interface using the SDK surface recorded in `docs/x402-sdk-verified-surface.md`. Amount, destination wallet, and `termsHash` as the payment reference.
5. `LocalStubSettlementAdapter` (already exists from phase 01) is the default and stays the default until real credentials are proven working.
6. Settlement receipt persisted: `deal_id`, `status`, `amount_micro_usdc`, `terms_hash`, `reference`, `tx_hash`, `is_stub`, `settled_at`, `latency_ms`, `explorer_url`.
7. On `WALK_AWAY`, both sides write a `postmortems` row from the phase 04 payload: reason code, which guardrail bound, own final band, counterparty's final offer, final gap, rounds used, and `zopaExisted` from the observer oracle.
8. **No payment may occur on any walk-away path.** Asserted by a test that runs scenario C and checks that zero settlement calls were made, using a counting spy adapter.
9. Settlement failure does not corrupt the negotiation record. The deal is marked `FAILED` with an error string; the transcript stands.

**Non-functional**

- Settlement is async and must not block the turn loop. The negotiation ends at `ACCEPT`; settlement resolves after.
- Latency recorded for every settlement, stub and real.
- Every module under 200 lines.

## Architecture

```
packages/settlement/
├── src/settlement-adapter-interface.ts        # from phase 01
├── src/local-stub-settlement-adapter.ts       # from phase 01
├── src/arc-x402-settlement-adapter.ts         # filled in here
├── src/compute-terms-hash.ts
├── src/canonical-deal-serialiser.ts
├── src/settlement-receipt-repository.ts
└── src/select-settlement-adapter.ts           # config-driven factory
packages/reporting/
├── src/build-walkaway-postmortem.ts
└── src/postmortem-repository.ts
```

**Settlement flow**

```
ACCEPT observed by orchestrator
   ├─► canonical-deal-serialiser ──► sha256 ──► termsHash
   ├─► deals row inserted (status PENDING)
   ├─► select-settlement-adapter (SETTLEMENT_MODE env)
   │        ├── local-stub → deterministic reference, 800ms delay, SETTLED, isStub=true
   │        └── arc-x402   → GatewayClient authorisation with termsHash as reference
   │                          → PENDING, poll or await per the verified SDK surface
   └─► settlement-receipt-repository.update(status, txHash?, latencyMs, explorerUrl?)
              └─► dashboard SSE event: settlement.updated
```

**Walk-away flow**

```
WALK_AWAY observed by orchestrator
   ├─► build-walkaway-postmortem(BUYER, phase-04 payload, oracle.zopa)
   ├─► build-walkaway-postmortem(SELLER, ...)
   ├─► postmortem-repository.insertBoth()
   └─► NO settlement adapter call, ever   [asserted by spy in tests]
```

The oracle result is included in the post-mortem because it answers "was a deal ever possible", which is the question scenario C exists to answer. It is written after the negotiation ends, so it cannot leak to an agent.

## Related Code Files

**Create**

- `packages/settlement/src/compute-terms-hash.ts`
- `packages/settlement/src/canonical-deal-serialiser.ts`
- `packages/settlement/src/settlement-receipt-repository.ts`
- `packages/settlement/src/select-settlement-adapter.ts`
- `packages/reporting/src/build-walkaway-postmortem.ts`
- `packages/reporting/src/postmortem-repository.ts`
- `packages/settlement/test/no-payment-on-walkaway.test.ts`
- `packages/settlement/test/terms-hash-canonical.test.ts`

**Modify**

- `packages/settlement/src/arc-x402-settlement-adapter.ts` (skeleton to implementation)
- `packages/orchestrator/src/negotiation-turn-loop.ts` (terminal hooks for ACCEPT and WALK_AWAY)
- `packages/ledger/src/schema-migrations.ts` (`deals`, `settlement_receipts`, `postmortems`)
- `README.md` (settlement honesty note)

**Delete**

- Nothing.

## Implementation Steps

1. **Walk-away path first.** `build-walkaway-postmortem.ts` plus repository plus the `postmortems` migration. Wire the turn loop's terminal hook. Run scenario C and print both post-mortems. This secures the non-negotiable demo before any Circle risk is taken.
2. `no-payment-on-walkaway.test.ts`: a counting spy adapter injected into scenarios B and C; assert `settle()` call count is 0 for C and exactly 1 for A.
3. `canonical-deal-serialiser.ts`: sorted keys, bigint as decimal string, no whitespace, explicit field order. `terms-hash-canonical.test.ts` asserts the hash is stable across key-insertion orders and across process restarts.
4. `deals` and `settlement_receipts` migrations. `settlement-receipt-repository.ts`.
5. `select-settlement-adapter.ts`: reads `SETTLEMENT_MODE`. If `arc-x402` is selected but credentials are absent, **fail loudly at startup**, never silently downgrade to the stub. A silent downgrade is how a fake tx hash ends up in a video.
6. Wire the `ACCEPT` terminal hook: compute hash, insert deal, call adapter, update receipt, emit event. Settlement runs after the turn loop returns, so a slow settlement never delays the transcript.
7. Run scenario A end to end on the stub. Confirm `PENDING` then `SETTLED`, `isStub: true`, and a populated `latency_ms`.
8. **Credential decision point, hard gate.** If `CIRCLE_API_KEY` and the entity secret exist: proceed to step 9. If not: stop here, mark this phase COMPLETE-ON-STUB, spend the reclaimed time on phase 07, and record in `README.md` and the video script that settlement is simulated pending credentials.
9. Implement `arc-x402-settlement-adapter.ts` strictly against `docs/x402-sdk-verified-surface.md`. Nothing in this file may be inferred from the blog post.
10. Fund the buyer wallet from `faucet.circle.com`. Confirm the balance before attempting a settlement; a failed settlement caused by an unfunded wallet is a 45-minute red herring.
11. Run scenario A live on Arc Testnet. **Record wall-clock latency from ACCEPT to SETTLED.** Write it into `docs/settlement-latency.md`. The video script (phase 08) depends on this number.
12. Capture the explorer URL and store it on the receipt. `https://testnet.arcscan.app` plus the reference or tx hash.
13. Failure handling: one retry on transport error, then `FAILED` with the error string. No exponential backoff, no dead-letter queue. YAGNI.
14. Full suite green. Commit.

## Todo List

- [x] Walk-away post-mortems built, persisted, printed for scenario C **(done first)**
- [x] `no-payment-on-walkaway` spy test green (C = 0 calls, A = 1 call)
- [x] Canonical deal serialiser with stable-hash test (4 tests, `terms-hash-canonical.test.ts`)
- [x] `deals`, `settlement_receipts`, `postmortems` migrations (schema version 3)
- [x] Adapter factory that fails loudly rather than downgrading silently (from phase 01, now used by the CLI)
- [x] ACCEPT terminal hook, running after the turn loop returns
- [x] Scenario A settles on the stub, `SETTLED_STUB` with a latency figure
- [x] **Credential gate evaluated: NEGATIVE, no wallet provisioned. Recorded in `plan.md` and `docs/settlement-latency.md`.**
- [ ] `arc-x402` adapter implemented against the verified SDK surface only **(gated out)**
- [ ] Buyer wallet funded and balance confirmed **(gated out; `pnpm --filter @parley/wallets balances` added to check it)**
- [ ] Live Arc Testnet settlement with a real reference or tx hash **(gated out)**
- [x] `docs/settlement-latency.md` written (stub measured, real path recorded as blocked)
- [x] Explorer URL stored on the receipt (populated only when a real tx hash exists)
- [x] Failure path marks FAILED without corrupting the transcript
- [x] Suite green (63 tests), committed

## Success Criteria

**Minimum (stub path, always achievable):**

1. Scenario A produces a `Deal` with a correct `amountMicroUsdc`, a stable `termsHash`, and a receipt transitioning `PENDING` to `SETTLED` with `isStub: true`.
2. Scenario C produces two post-mortems, each naming the binding guardrail and the final gap, with `zopaExisted: false`, and **zero** settlement calls.
3. Spy test green.

**Target (real path, credential-dependent):**

4. A transaction or batch reference visible on `https://testnet.arcscan.app`, linked from the settlement panel.
5. `docs/settlement-latency.md` records a measured ACCEPT-to-SETTLED latency.
6. `termsHash` appears in the payment reference, verifiable by recomputing it from the ledger.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Circle credentials never arrive | **High** | Medium | Adapter plus stub, decided in phase 01. Ship on stub with an explicit `SIMULATED` badge and an honest video line. Judging criterion 2 is partially served by Wallets and the verified SDK integration even without a live settlement. |
| SDK surface differs from the blog and the adapter has to be rewritten | Medium | Medium | Phase 01 already resolved this. If phase 01 flagged divergence, this phase inherits the re-planned design, not a surprise. |
| Faucet cannot fund the wallet in time | Medium | Medium | Amounts are micro-USDC; 1 USDC funds hundreds of settlements. Request from day 1 of phase 01. |
| Batch settlement latency exceeds the video's patience | Medium | Medium | Measured at step 11 before scripting. If slow, the video shows the authorisation and cuts to the settled state, narrated honestly. |
| A stubbed settlement is mistaken for real in the video | Low | **Critical** | `isStub` propagated to the UI as a badge; adapter factory fails loudly rather than downgrading; explicit checklist item in phase 08. |
| Phase overruns and eats the dashboard slot | Medium | High | Cut order inside the phase: live settlement (ship stub), then explorer linking, then retry handling. **Never cut walk-away reporting**, which is why it is step 1. |

**Rollback:** `SETTLEMENT_MODE=local-stub` reverts the entire real-settlement path at runtime with no code change. Walk-away reporting has no external dependency and cannot be broken by a settlement rollback.

**File ownership:** owns `packages/settlement/**` and `packages/reporting/**`. Additive edits to the turn loop, migrations, README.

## Security Considerations

- Circle API key and entity secret in `.env` only; redacted from all logs and error paths, including the `FAILED` error string persisted on the receipt (sanitise before storing).
- `termsHash` binds the payment to the agreed terms. Recompute and compare on read; never trust a stored hash as authoritative without the deal row.
- Amounts are bigint micro-USDC end to end. No float ever touches a settlement amount. A rounding bug here is a real financial bug even on testnet.
- Testnet only. No mainnet configuration may exist in the repo, including in `.env.example`.
- Idempotence: settling the same `dealId` twice must not double-pay. Enforce with a unique constraint on `deals.negotiation_id` and a status check before calling the adapter.
- The `SIMULATED` badge is a security-adjacent integrity control, not decoration. Treat removal of it as a blocking review failure.

## Next Steps

- **Unblocks:** phase 07 (settlement panel data, post-mortem panel data), phase 08 (latency figure for the video script).
- **Blocked by:** phase 04 for the post-mortem payload; phase 01 for the adapter and verified SDK surface.
- **Owner gate before phase 07:** confirm which settlement mode ships, so the dashboard copy and the video script are written once and not twice.

## Unresolved Questions

1. Will Circle credentials exist by Friday 7 Aug afternoon? This is the single decision that determines whether steps 9 to 12 run at all.
2. Does the SDK expose settlement status or a manual flush (spec open question 4)? Answered by phase 01. If not, `PENDING` may never resolve to `SETTLED` within the demo, in which case the panel shows "authorisation issued, batch pending" and the video says exactly that.
3. Should the seller's payout wallet withdrawal be demonstrated, or is Gateway balance accrual sufficient? Proposal: sufficient. A withdrawal step is more Circle-tool surface for criterion 2 but costs time this schedule does not have.
4. Is a plain USDC transfer on Arc an acceptable fallback if Nanopayments is unusable? Escalated from phase 01; needs an answer before step 9.
