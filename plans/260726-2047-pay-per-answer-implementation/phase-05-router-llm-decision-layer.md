# Phase 05: Router LLM Decision + Human-Readable Reasons

**Context:** [plan.md](plan.md) · [phase-04](phase-04-router-deterministic-scoring.md)
**Priority:** P0 (**the visible half of the submission**)
**Status:** ☐ Not started
**Days:** Aug 2-3

## Overview

The LLM picks between the two shortlisted providers and writes one sentence explaining why.
That sentence is what judges actually see and remember.

## Key insights

- The reason string is the product surface. A correct routing decision nobody can read is worth
  less than a good decision with a legible justification.
- The LLM must be **strictly bounded**: it chooses from a 2-item shortlist, never freely.
  A hallucinated provider id must be impossible to act on.
- This layer must be optional at runtime. If the LLM is slow or down, take the deterministic
  top pick and a templated reason. The system never blocks on it.

## Requirements

**Functional**
- Input: shortlist with factor decompositions, budget state, job text, criticality.
- Output: `{ providerId, reason, confidence }`, with `providerId` validated against the shortlist.
- Reason: one sentence, ≤140 chars, cites the actual deciding factor (price, quality, budget).
- Timeout ~2s → deterministic fallback with a templated reason, flagged as `fallback: true`.
- Every decision persisted with both the LLM choice and what the deterministic layer would
  have chosen; the disagreement rate is an interesting demo statistic.

**Non-functional**
- Strict JSON output, schema-validated. Invalid → fallback, never a crash.
- Router LLM cost must not dominate the answer cost. Cheap model, short prompt.

## Architecture

```
packages/router/src/
├── llm-decision-layer.ts        # prompt, call, validate, fallback
├── decision-prompt.ts           # prompt template
└── route.ts                     # score → shortlist → LLM → RoutingDecision
```

`route.ts` becomes the single public entry point for the whole router.

## Related code files

**Create:** `packages/router/src/llm-decision-layer.ts`, `decision-prompt.ts`, `route.ts`
**Modify:** `apps/buyer/src/job-orchestrator.ts` (call `route()`),
`packages/shared/src/ledger-store.ts` (persist decisions)

## Implementation steps

1. `decision-prompt.ts`: system prompt framing the agent as a budget-conscious buyer. Include
   the shortlist with per-factor contributions, remaining budget, burn rate, job criticality.
   Demand JSON `{ providerId, reason, confidence }`.
2. `llm-decision-layer.ts`: call with a hard timeout; validate JSON; **validate `providerId` is
   in the shortlist**; on any failure return the deterministic pick with a templated reason.
3. `route.ts`: compose scoring → shortlist → LLM → `RoutingDecision`, carrying the factor
   decomposition through for the dashboard.
4. Persist `routing_decisions` (job_id, chosen, deterministic_top, reason, confidence,
   fallback, factors JSON).
5. Wire into the orchestrator, replacing the direct phase-04 call.
6. Re-run the benchmark; record LLM-vs-deterministic disagreement rate and whether disagreements
   improved quality-per-USDC. **If the LLM never disagrees, the layer is decorative; say so
   honestly in the pitch rather than overclaiming.**
7. Tune the prompt until reasons read as decisions a human treasurer would defend.

## Todo

- [ ] Decision prompt template
- [ ] LLM layer with timeout, JSON validation, shortlist validation
- [ ] Deterministic fallback + templated reasons
- [ ] `route()` entry point composing both layers
- [ ] Decisions persisted with factors
- [ ] Orchestrator wired
- [ ] Disagreement rate measured and recorded

## Success criteria

Run the benchmark and read the reason strings: each one names the real deciding factor and
would satisfy someone asking "why did you spend my money there?". Killing the LLM mid-run
degrades to deterministic routing with zero failed jobs.

## Risk assessment

| Risk | Mitigation |
|---|---|
| LLM rubber-stamps the deterministic pick | Measure it. Report honestly. The deterministic layer still carries the submission. |
| Reasons are generic filler | Force the prompt to cite a numeric factor value. Reject reasons that cite none. |
| Router LLM cost > answer cost | Cheap model, short prompt, measure per-decision cost and show it on the dashboard. |
| Hallucinated provider id | Hard validation against the shortlist. Non-negotiable. |

## Security

- Job text goes to the router LLM; note it in the README. Testnet demo only, no real user data.
- Never put wallet keys or API keys in the prompt context.

## Next steps

Phase 06 adds the hard budget guard and batch settlement view.
