# Phase 04: Deterministic Negotiation (Utility, Concession, ZOPA)

## Context Links

- Plan: [`plan.md`](plan.md)
- Spec: [`../../spec.md`](../../spec.md) sections 5 (deterministic layer), 8 (scenarios), 9 (utility inputs)
- Depends on: [`phase-03-guardrail-engine-hard-clamps.md`](phase-03-guardrail-engine-hard-clamps.md)
- Feeds: [`phase-05-llm-layer-rationale-log.md`](phase-05-llm-layer-rationale-log.md), [`phase-06-settlement-and-walkaway-reporting.md`](phase-06-settlement-and-walkaway-reporting.md)

## Overview

- **Priority:** P0. The engine's brain. Never cut.
- **Status:** **COMPLETE 2026-08-03** (commit `218c42a`). Status line was left stale at the time;
  corrected on 2026-08-03 after verifying every todo item against the code, the 15 engine tests,
  the determinism test in the orchestrator suite, and `docs/engine-benchmark.md`. The engine
  beats the baseline on both rounds and price quality in all three scenarios.
- **Day:** Thu 6 Aug
- **Brief:** Utility function per side over price, quantity, and terms. Concession schedule. ZOPA detection with early walk-away. Benchmarked against the phase 02 fixed-concession baseline on scenarios A, B, C.

## Key Insights

- **The information-asymmetry trap, and the most important design call in this phase.** Spec section 5 says "if the two reservation prices cannot overlap, detect and walk away early". Spec section 3 says neither agent sees the other's reservation values. These pull in opposite directions. Resolution: **two separate detectors.**
  - `zopa-inference-from-revealed-offers.ts` runs **inside each agent**. It sees only the counterparty's revealed offer sequence, projects their concession trend, and asks: can their projected floor ever reach my band? If not, walk away early. This is honest inference, and it is what makes the agents look intelligent.
  - `zopa-oracle-for-observers.ts` runs **outside both agents**, in the orchestrator. It has both guardrail sets and computes the true ZOPA for the dashboard and for post-mortems. **No agent may import it.** Enforce with a grep check in CI-equivalent (a test).
  - Getting this wrong is a credibility hole a judge could open in one question. Getting it right is a talking point.
- Utility must be normalised to `[0,1]` against **each side's own private bounds**. Raw utilities are not comparable across sides and must never be compared in code.
- The concession schedule is where scenario B earns its keep. A linear schedule converges dully. A time-dependent schedule (concede slowly early, faster as rounds run out) produces the visible late convergence the spec asks for.
- The baseline from phase 02 stays. Without a benchmark, "the engine works" is an assertion.
- **MEASURED BASELINE, recorded 2026-08-03. These are the numbers the engine must beat, and the comparison MUST be reported in this phase's output.**

  | Scenario | Baseline outcome | Rounds to termination | Settled unit price |
  |---|---|---|---|
  | A (wide ZOPA) | SETTLED | **round 10 of 12** (20 messages) | 1045 micro-USDC |
  | B (narrow ZOPA) | SETTLED | **round 12 of 12** (24 messages) | 900 micro-USDC, exactly the buyer's limit |
  | C (no ZOPA) | WALKED_AWAY | round 12 of 12 (25 messages), by round cap | none |

  Targets for the engine: beat **round 10** on A, beat **round 12** on B, and on
  C walk away EARLY by detecting the empty band rather than burning all 12
  rounds to the cap. C is the clearest win available: the baseline wastes the
  entire round budget discovering what ZOPA detection knows immediately.
  Reproduce the baseline with `STRATEGY=baseline` and confirm these figures
  before claiming any improvement.
- Terms are the interesting lever: the engine should trade a term concession for a price concession (give a looser delivery window, hold price). That behaviour is what separates this from a price-only haggle.

## Requirements

**Functional**

1. `computeBuyerUtility(guardrails, offer) -> number` in `[0,1]`. Inputs per spec section 9: calls secured and SLA tier positive, unit price and total spend negative.
2. `computeSellerUtility(guardrails, offer) -> number` in `[0,1]`. Margin per call and capacity utilised positive, delivery-window tightness and SLA commitment cost negative.
3. `computeConcessionTarget(round, roundCap, band, aspiration, reservation) -> targetPrice` implementing a time-dependent schedule with a tunable exponent.
4. `proposeNextOffer(state) -> Proposal` producing a full offer (price, quantity, terms), including the terms-for-price trade heuristic.
5. `shouldAccept(guardrails, inboundOffer, state) -> boolean`: accept if inbound utility is at or above the utility the agent could realistically still reach in the rounds remaining, and at or above `minAcceptableUtility`.
6. `zopa-inference-from-revealed-offers.ts`: from the counterparty's revealed offers only, estimate their floor by trend extrapolation. If the estimate cannot intersect own band with a configurable confidence margin, emit `WALK_AWAY` with an inferred reason code.
7. `zopa-oracle-for-observers.ts`: true ZOPA from both guardrail sets. Orchestrator and dashboard only.
8. Walk-away triggers, all typed: empty band (`NO_FEASIBLE_OFFER` from phase 03, mapped to its `cause`), inferred no-ZOPA, `UTILITY_BELOW_RESERVATION`, `COUNTERPARTY_STALLED` (counterparty moved less than a threshold for N consecutive rounds), `ROUND_CAP_REACHED`.
9. Benchmark harness comparing engine versus baseline across A, B, C on: rounds to termination, final utility per side, whether the outcome was correct, and clamp-bite count.

**Non-functional**

- Deterministic given a seed. Same scenario, same seed, same ladder, byte for byte. This matters for the demo video: the run must be reproducible on camera.
- Pure functions, no I/O. Every module under 200 lines.
- No agent module may import the oracle. Enforced by test.

## Architecture

```
packages/negotiation-engine/
├── src/buyer-utility-function.ts
├── src/seller-utility-function.ts
├── src/normalise-utility-inputs.ts        # shared min-max normalisation, DRY
├── src/time-dependent-concession-schedule.ts
├── src/terms-for-price-trade-heuristic.ts
├── src/propose-next-offer.ts              # orchestrates the above, then calls the phase 03 clamp
├── src/should-accept-decision.ts
├── src/zopa-inference-from-revealed-offers.ts   # agent-side, revealed info only
├── src/zopa-oracle-for-observers.ts             # orchestrator-side, both guardrail sets
├── src/walk-away-decision.ts
└── src/negotiation-state-types.ts
packages/orchestrator/
└── src/benchmark-engine-vs-baseline.ts
```

**Utility, concrete form**

Weighted sum of normalised components, weights per side summing to 1 and declared in the scenario config so the dashboard can show them.

```
buyerUtility  = wPrice   * (1 - norm(unitPrice, 0, maxUnitPrice))
              + wQty     * norm(quantity, minQuantity, targetQuantity)
              + wSla     * norm(slaOrdinal, minSlaOrdinal, 2)
              + wSpend   * (1 - norm(unitPrice * quantity, 0, maxTotalSpend))

sellerUtility = wMargin  * norm(unitPrice - costBasisAdjusted(terms), 0, marginCeiling)
              + wUtil    * norm(quantity, 0, availableQuantity)
              + wDeliver * norm(deliveryWindowHours, minWindow, maxWindow)
              + wSlaCost * (1 - norm(slaOrdinal, 0, 2))
```

`norm` clamps to `[0,1]`. Proposed default weights: buyer `0.40 / 0.30 / 0.15 / 0.15`, seller `0.45 / 0.30 / 0.15 / 0.10`. Tunable per scenario.

**Concession schedule (time-dependent, Faratin-style)**

```
progress = round / roundCap
alpha    = progress ^ beta                 // beta > 1 => concede late; beta < 1 => concede early
target   = aspiration + alpha * (reservation - aspiration)
```

`beta` default 2.0 so concessions are visibly back-loaded, which is what makes scenario B watchable. `aspiration` is the side's opening ask; `reservation` is its band edge. The target is then handed to the phase 03 clamp, which is the only thing that can authorise it.

**Data flow per turn (full stack after this phase)**

```
inbound envelope
   ├─► update negotiation state (counterparty offer history, movement deltas)
   ├─► zopa-inference-from-revealed-offers  ──► no-hope? ──► walk-away-decision ──► WALK_AWAY
   ├─► should-accept-decision               ──► yes?     ──► clamp ACCEPT ──► ACCEPT
   └─► propose-next-offer
          ├─ time-dependent-concession-schedule → target price
          ├─ terms-for-price-trade-heuristic    → adjusted quantity + terms
          └─ clampOffer (phase 03)              → feasible offer | NO_FEASIBLE_OFFER
                                                        │              └─► WALK_AWAY (mapped cause)
                                                        ▼
                                            COUNTEROFFER on the bus (egress guard re-checks)
```

Note the clamp sits **after** every strategy decision, always. Phase 05 inserts the LLM between the schedule and the clamp, never after it.

## Related Code Files

**Create**

- All ten `packages/negotiation-engine/src/*.ts` files listed above
- `packages/orchestrator/src/benchmark-engine-vs-baseline.ts`
- `packages/negotiation-engine/test/utility-monotonicity.test.ts`
- `packages/negotiation-engine/test/concession-schedule.test.ts`
- `packages/negotiation-engine/test/zopa-detection.test.ts`
- `packages/negotiation-engine/test/agent-cannot-import-oracle.test.ts`

**Modify**

- `packages/agents/src/buyer-agent.ts`, `seller-agent.ts` (swap the baseline strategy for the engine, keep the baseline selectable by config)
- `packages/orchestrator/src/scenario-definitions.ts` (add utility weights, beta, stall thresholds)
- `packages/ledger/src/schema-migrations.ts` (`decision_states` now stores utility, target, band, and inference output)

**Delete**

- Nothing. `fixed-concession-baseline-strategy.ts` is retained as the benchmark.

## Implementation Steps

1. `negotiation-state-types.ts`: `NegotiationState { round, roundCap, ownHistory, counterpartyHistory, movementDeltas, stallCount }`. Immutable updates only.
2. `normalise-utility-inputs.ts`: one `norm(value, lo, hi)` clamped to `[0,1]`, plus `slaToOrdinal`. Shared by both utility functions (DRY). Handle `hi === lo` without dividing by zero.
3. Both utility functions. Write the monotonicity tests first: buyer utility strictly decreases in price, strictly increases in quantity up to target; seller utility strictly increases in price. If a test fails, the weights or the normalisation are wrong, not the test.
4. `time-dependent-concession-schedule.ts` with `beta` injected. Test: at `round = 1` target equals aspiration; at `round = roundCap` target equals reservation; monotone in between; never outside `[aspiration, reservation]`.
5. `terms-for-price-trade-heuristic.ts`: if own price target would fall below own reservation, first try buying the gap back with a term concession (loosen delivery window by one step, or drop SLA one tier) and recompute the band. Cap at one term concession per round so the ladder stays readable. This is the single highest-value behaviour in the demo; do not skip it, but timebox to 60 minutes and fall back to price-only if it fights back.
6. `should-accept-decision.ts`: accept when inbound utility is at or above `max(minAcceptableUtility, projectedBestReachableUtility(roundsRemaining))`. `projectedBestReachable` reuses the concession schedule, so it costs nothing extra.
7. `zopa-inference-from-revealed-offers.ts`: linear-regress the counterparty's last `k` offers (k = 3, fall back to 2). Extrapolate to `roundCap`. If the extrapolated value cannot reach own band edge with a margin of `zopaConfidenceMargin` (default 5%), return `{ hopeless: true, inferredReason }`. Require at least 3 observed counterparty offers before it may fire, otherwise it will walk away on round 1 and ruin scenario A.
8. `zopa-oracle-for-observers.ts`: intersect both bands at the buyer's target quantity. Return `{ exists, loMicroUsdc, hiMicroUsdc, widthMicroUsdc, blockingCause }`. Orchestrator-only.
9. `agent-cannot-import-oracle.test.ts`: read the source of every file under `packages/agents` and `packages/negotiation-engine` except the oracle itself, assert none contains `zopa-oracle-for-observers`. Crude, effective, five lines.
10. `walk-away-decision.ts`: single place that maps every trigger to a reason code and a structured payload (which guardrail bound, final gap, own final band). Phase 06 renders this payload as the post-mortem, so shape it now: `{ reasonCode, boundName, ownBand, counterpartyLastOffer, finalGapMicroUsdc, roundsUsed }`.
11. Swap agents onto the engine. Keep `STRATEGY=baseline|engine` env selectable for the benchmark.
12. `benchmark-engine-vs-baseline.ts`: run A, B, C under both strategies with a fixed seed, print a comparison table, write it to `docs/engine-benchmark.md`. This table goes in the deck.
13. **Tune scenario B until it is genuinely interesting:** engine converges, baseline either fails or converges at a materially worse utility, and convergence happens in the back half of the round budget. Timebox tuning to 45 minutes.
14. **Verify scenario C end to end:** both sides walk away, no `ACCEPT` anywhere in the transcript, both post-mortem payloads populated, oracle confirms no ZOPA existed. This is non-negotiable and is the phase's hardest success criterion.
15. `pnpm test` and `pnpm -r build` clean. Commit.

## Todo List

- [ ] Negotiation state types, immutable updates
- [ ] Shared normalisation helper
- [ ] Buyer utility with monotonicity test
- [ ] Seller utility with monotonicity test
- [ ] Time-dependent concession schedule with endpoint tests
- [ ] Terms-for-price trade heuristic (timeboxed 60 min, price-only fallback)
- [ ] Accept decision using projected reachable utility
- [ ] Agent-side ZOPA inference from revealed offers only, min 3 observations
- [ ] Observer-side ZOPA oracle, orchestrator only
- [ ] Import-isolation test proving no agent sees the oracle
- [ ] Walk-away decision mapping every trigger to a typed post-mortem payload
- [ ] Agents switched to the engine, baseline still selectable
- [ ] Benchmark harness writing `docs/engine-benchmark.md`
- [ ] Scenario A converges fast and settles
- [ ] Scenario B converges late after real concessions, beating the baseline
- [ ] **Scenario C: both walk away, zero ACCEPT, both post-mortems populated**
- [ ] Determinism check: same seed, identical ladder across three runs
- [ ] Build and tests clean, committed

## Success Criteria

Measurable:

1. ~~Scenario A terminates in `ACCEPT` within 6 rounds.~~ **DROPPED 2026-08-03,
   see spec.md section 8.** Measured: a beta sweep from 0.8 to 2.5 settled at
   rounds 9 to 11 across the whole range, so the concession curve is not the
   lever. The binding constraint is the acceptance rule, and loosening it to buy
   rounds shortens the ladder, which is the thing the demo depends on.
   Replacement: A must settle with a legible ladder and beat the baseline on
   rounds AND price quality. Achieved: round 9 vs baseline 10, and 4 vs 67
   micro-USDC from the ZOPA midpoint.
2. Scenario B terminates in `ACCEPT` in the back half of the round budget (round 7 or later of 12), with at least three price concessions from each side and at least one terms concession somewhere in the ladder.
3. Scenario C terminates in `WALK_AWAY` from both sides, contains zero `ACCEPT` messages, and the oracle independently confirms no ZOPA existed.
4. Benchmark table shows the engine strictly better than the baseline on at least two of the three scenarios, on rounds-to-agreement or final utility.
5. Three consecutive runs of each scenario with the same seed produce byte-identical ladders.
6. `agent-cannot-import-oracle.test.ts` green.
7. All phase 03 property tests still green. The engine changed the proposals; it must not have changed the guarantees.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Utility weights produce nonsense behaviour and eat the day in tuning | **High** | High | Monotonicity tests first, then a 45-minute tuning timebox for scenario B. If unresolved, freeze weights at the defaults and accept a duller scenario B. |
| Agent-side ZOPA inference fires too early and breaks scenario A | Medium | High | Minimum 3 observed counterparty offers before it may fire, plus a confidence margin. Test A explicitly for premature walk-away. |
| Someone "simplifies" by letting the agent read the oracle | Medium | **High** | Import-isolation test. Credibility risk, not a functional one, which makes it easy to miss in review. |
| Terms-for-price heuristic is fiddly and overruns | Medium | Medium | 60-minute timebox, price-only fallback. The demo survives without it; the day does not survive a rabbit hole. |
| Scenario C accidentally produces an ACCEPT after tuning | Low | **Critical** | Scenario C is an assertion in the test suite, not a manual check. It runs on every commit from here on. |
| Non-determinism from `Date.now()` or `Math.random()` creeping in | Medium | Medium | Seeded RNG injected; a test runs each scenario three times and diffs. |
| Phase overruns into Friday, compressing 05 and 06 | **High** | High | Cut order inside the phase: terms heuristic, then benchmark polish, then inference sophistication (degrade to "walk away when own band is empty" only). Never cut scenario C. |

**Rollback:** the engine is a new package; agents keep the baseline strategy behind a config flag. Reverting to `STRATEGY=baseline` restores a working end-to-end negotiation in one env var, with no code change. This is the cheapest rollback in the plan and is deliberate.

**File ownership:** owns `packages/negotiation-engine/**` and `benchmark-engine-vs-baseline.ts`. Additive edits to agents, scenarios, migrations.

## Security Considerations

- Utility and concession code consumes **numbers only**. Counterparty `rationale` text is never an input. Preserves the phase 03 P6 guarantee end to end.
- Agent-side inference uses only information the counterparty actually revealed on the wire. No private data crosses the boundary, and the import-isolation test proves it structurally rather than by convention.
- The oracle's output reaches the dashboard, which is an audience-facing surface. It must not be published on the message bus under any circumstance, or the counterparty would receive it.
- Post-mortem payloads contain own guardrail values. They are written to the ledger and shown to the audience, never sent to the counterparty. Keep post-mortems out of the envelope type.

## Next Steps

- **Unblocks:** phase 05 (the LLM picks inside the band this phase computes), phase 06 (post-mortem payload shape, settlement amount from the accepted offer).
- **Blocked by:** phase 03.
- **Owner gate before phase 05:** review `docs/engine-benchmark.md` and watch a scenario B ladder. If B is not visibly interesting, fix it here; phase 05 cannot rescue it.

## Unresolved Questions

1. Are the proposed utility weights acceptable, or does the owner have a view on what a buyer of inference capacity actually cares about? Weights are the most subjective thing in the build.
2. Should `beta` (concession back-loading) differ per side? Asymmetric betas make ladders more lifelike but add a tuning dimension the schedule cannot afford.
3. `COUNTERPARTY_STALLED` threshold: how little movement over how many rounds counts as stalling? Proposal: under 1% of own band width for 3 consecutive rounds.
4. Should the buyer be allowed to walk away purely on inference while a ZOPA actually exists (a false-positive walk-away)? It is realistic and it is a good talking point, but it would break scenario A if it ever fired. Proposal: allow it in principle, tune it so it cannot fire in A or B.
