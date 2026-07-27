# Phase 04: Router Deterministic Scoring

**Context:** [plan.md](plan.md) · [phase-03](phase-03-buyer-agent-payment-loop.md)
**Priority:** P0 (**this and phase 05 are the submission**)
**Status:** ☐ Not started
**Days:** Jul 31-Aug 1

## Overview

Replace the stub with a transparent scoring function that ranks providers on price, observed
quality, observed reliability, budget pressure, and job criticality, then shortlists the top 2
for the LLM layer in phase 05.

## Key insights

- Deterministic-first is what makes this defensible: the LLM never picks blind, and every
  decision is explainable from numbers the dashboard can show.
- **Budget pressure is the mechanism that makes this a *programmable money* project** rather
  than a generic model router. As the daily budget depletes, the score must shift toward cheap
  providers on its own. That behaviour is the demo's centrepiece.
- Cold start matters: with no observations, quality EWMA is meaningless. Seed from tier priors
  and let evidence override them.

## Requirements

**Functional**
- Score every provider; return a ranked shortlist of 2 with per-factor contributions attached.
- Factors: normalised price, quality EWMA, reliability (1 − error rate), latency EWMA,
  budget burn pressure, job criticality.
- Criticality reweights, it does not override: high criticality raises the quality weight and
  lowers the price weight.
- Exclude providers whose price exceeds remaining budget.

**Non-functional**
- Pure function: `(providerStats[], budgetState, job) → ScoredProvider[]`. No I/O.
- Every score decomposable into named factor contributions; the dashboard renders these.
- Unit tested. This is the one component that genuinely warrants tests.

## Architecture

```
packages/router/src/
├── score-providers.ts           # pure scoring function
├── scoring-weights.ts           # weight table + criticality modifiers
├── budget-pressure.ts           # burn rate vs remaining budget → 0..1 pressure
└── provider-priors.ts           # cold-start priors per tier
```

Score shape (weights in `scoring-weights.ts`, tuned in step 6):

```
score = w_quality     * qualityEwma
      + w_reliability * (1 - errorRate)
      + w_latency     * latencyScore
      - w_price       * normalisedPrice * (1 + budgetPressure)
```

`budgetPressure` ∈ [0,1] scales the price penalty; it is the single line that makes the router
economise as funds deplete.

## Related code files

**Create:** `packages/router/src/*` (above), `packages/router/test/score-providers.test.ts`
**Modify:** `apps/buyer/src/job-orchestrator.ts` (call scorer instead of stub)
**Delete:** `apps/buyer/src/choose-provider-stub.ts`

## Implementation steps

1. `budget-pressure.ts`: pressure from spend rate vs remaining daily budget and remaining
   expected jobs. Near-zero early in the day, → 1 as the budget runs down.
2. `provider-priors.ts`: cold-start quality priors per tier; blend out as call count rises
   (`weight = n / (n + k)`, k ≈ 5).
3. `scoring-weights.ts`: base weights + criticality modifiers (`low`/`normal`/`high`).
4. `score-providers.ts`: pure scorer emitting `{ providerId, score, factors[] }`, factors
   carrying name, raw value, weight, contribution.
5. Filter unaffordable providers; return top 2.
6. Unit tests for the behaviours that must hold:
   - budget pressure at 1.0 flips the choice to the cheapest affordable provider
   - high criticality flips it to the highest-quality provider
   - a provider with a collapsed reliability score is never shortlisted
   - cold start falls back to priors, then evidence overrides them
7. Swap into the orchestrator; delete the stub; re-run the 20-question benchmark and compare
   total spend and mean quality against the phase-03 always-`swift` baseline.

## Todo

- [ ] Budget pressure function
- [ ] Cold-start priors with evidence blending
- [ ] Weight table + criticality modifiers
- [ ] Pure scorer with factor decomposition
- [ ] Unit tests (4 behaviours above) passing
- [ ] Stub deleted, orchestrator wired
- [ ] Benchmark re-run; baseline comparison recorded

## Success criteria

A recorded comparison against the always-`swift` baseline showing the router achieving better
quality per USDC spent (**this number is the pitch**). Plus: draining the budget visibly shifts
selection toward cheap providers, with no code change.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Weights tuned to look good on the benchmark | Keep a held-out question set the weights were never tuned on. |
| Router shows no improvement over baseline | Then the price/quality spread is too narrow; widen it in phase 02 config, don't fudge the scorer. |
| Over-engineering the scoring maths | YAGNI. Linear weighted sum. No ML. Legibility on the dashboard beats sophistication. |

## Security

None specific: pure computation, no I/O, no secrets.

## Next steps

Phase 05 puts the LLM on top of this shortlist.
