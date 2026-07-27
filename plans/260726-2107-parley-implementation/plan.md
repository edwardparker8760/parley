# Parley Implementation Plan

**Spec:** [`spec.md`](../../spec.md) · **Track:** Agentic Economy
**Window:** Mon 13 Jul → Sun 9 Aug 2026 (4 weeks, AoE). Plan written day 14.
**Supersedes:** `plans/260726-2047-pay-per-answer-implementation/` (multi-provider router idea)
**Mode:** GATED: pause for owner review at every phase boundary.

## Deadlines

| | |
|---|---|
| **Checkpoint 2 (mid)** | **Mon 27 Jul, 18:59 GMT+7**: repo link + progress summary + track. WIP fine. |
| Registration closes | Sat 8 Aug |
| **Final submission** | **Sun 9 Aug (AoE)**: MVP on Arc, public repo, 3-min video, deck |
| Demo Day | Thu 20 Aug |

## Effort split

~25% plumbing (x402, wallets, settlement) / ~75% negotiation engine + dashboard.
The engine and the guardrail clamp are the submission. Everything else is scaffolding for them.

## Phases

| # | Phase | Days | Gate | Status |
|---|---|---|---|---|
| 00 | Checkpoint 2 package | **Jul 26-27** | before submit | ⏳ In progress |
| 01 | Scaffold, wallets, SDK spike | Jul 27-28 | ☐ | ☐ |
| 02 | Negotiation protocol + agent skeletons | Jul 28-29 | ☐ | ☐ |
| 03 | Guardrail engine (hard clamps) | Jul 30-31 | ☐ | ☐ |
| 04 | Deterministic negotiation: utility, concession, ZOPA | Jul 31-Aug 2 | ☐ | ☐ |
| 05 | LLM layer + rationale log | Aug 2-3 | ☐ | ☐ |
| 06 | Settlement on accept + walk-away reporting | Aug 4-5 | ☐ | ☐ |
| 07 | Dashboard: transcript + convergence ladder | Aug 5-6 | ☐ | ☐ |
| 08 | Submission: video, deck, hardening | Aug 7-9 | ☐ | ☐ |
| 09 | **CONDITIONAL**: Reputation layer (spec §13) | only if 01-07 done on schedule | ☐ | ☐ |

### Phase intents

- **00**: git init, `.gitignore`, README, public repo, pasteable progress summary. Nothing else.
- **01**: pnpm monorepo, 3 wallets (buyer / seller / payout), and a throwaway 402 spike that
  **verifies the real `@circle-fin/x402-batching` API**. Research read it off a blog post, not
  the package; everything downstream depends on this being true.
- **02**: message envelope (`OFFER`/`COUNTEROFFER`/`ACCEPT`/`WALK_AWAY`), turn loop, round cap,
  SQLite transcript store. Two agents talking, with dumb fixed-concession logic.
- **03**: owner guardrails as **deterministic hard clamps**. Feasible-band computation. Property
  tests proving no message can ever leave a side's band. This is the safety claim; it gets tests.
- **04**: utility functions, concession schedule, ZOPA detection with early walk-away. The
  engine's brain. Benchmarked against a fixed-concession baseline on the three scenarios.
- **05**: LLM picks inside the feasible band and writes the rationale on every offer. Bounded:
  schema-validated, out-of-band proposals rejected, timeout → deterministic fallback.
- **06**: on ACCEPT settle `price × quantity` in USDC on Arc, terms hashed into the payment ref;
  on WALK_AWAY emit structured post-mortems. **Measure real settlement latency here**, before the
  video is scripted.
- **07**: one screen: live transcript, convergence chart with audience-visible reservation prices,
  guardrail-clamp markers, settlement panel, scenario A/B/C launchers.
- **08**: deploy, README, 3-min video, deck. **Submit Fri 8 Aug**, a day early; the platform locks.
- **09 (conditional)**: reputation layer per spec §13: post-deal seller reviews (1-5 + LLM
  comment) in the SQLite ledger; trust score deterministically scales the buyer's opening offer,
  concession schedule, and walk-away round cap; scenario D on the dashboard. **Gate: starts only
  if 01-07 are complete and on schedule.** Realistic slot: Aug 6-7, between dashboard and
  submission, compressing 08's slack.

## Scope discipline

Phases 03-05 are the differentiator. Cut order when anything slips:
**09 (reputation) first → then 07 dashboard polish → then 06 manual settle flush.**
Never cut 03-05. Scenario C (no ZOPA → both walk away) is non-negotiable; it is the proof the
guardrails bind. Scenario D exists only if 09 survives.

## Key risks

| Risk | Mitigation |
|---|---|
| **Git not installed on this machine** | Blocks phase 00 entirely. Resolve today. |
| SDK surface unverified | Phase 01 spike. If it diverges, re-plan 02/06 rather than push through. |
| Faucet ~1 USDC/day, no backfill | Request daily from phase 01. Settlement demos need funded wallets. |
| LLM negotiates past guardrails | Impossible by construction: clamp is deterministic and tested (phase 03). |
| Negotiations converge trivially | Scenario B tuned for a narrow ZOPA so concessions are visibly earned. |
| Two-service split eats a day | Open question 2 below; decide before phase 02. |

## Open questions

1. **What is being traded?** Spec §9 assumes bulk inference capacity. Blocks phase 04's utility
   function. Needs an answer before Jul 31.
2. **One process or two services?** Two services is more credible as "independent parties" and
   costs ~half a day. Leaning two. Decide before phase 02.
3. Judging weights unpublished; assuming equal.
4. Does the SDK expose settlement status / manual flush? Unknown until phase 01.
