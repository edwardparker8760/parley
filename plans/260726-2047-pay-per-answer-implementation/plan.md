> **⛔ SUPERSEDED 2026-07-26.** The registered project is **Parley** (Agentic Economy track).
> Active plan: [`../260726-2107-parley-implementation/plan.md`](../260726-2107-parley-implementation/plan.md) · spec: [`../../spec.md`](../../spec.md)
> Retained for the carried-over parts: x402 plumbing, wallet topology, budget guard, reasoning log.

# Pay-Per-Answer: Implementation Plan

**Programme:** Encode Club × Arc, Programmable Money Hackathon (`arc-hackathon`)
**Window:** Mon 13 Jul → Sun 9 Aug 2026 (4 weeks, AoE). **Plan written day 14 of 28.**
**Final submission:** Sun 9 Aug: MVP on Arc + public repo + 3-min video + deck. Demo Day Thu 20 Aug.
**Research basis:** `context/latest.md`, `context/session-status-2026-07-26.md`

## Thesis

Micropayment-metered AI answers on Arc. A buyer agent pays per call in USDC over x402
across **3 competing providers**, choosing at runtime on price × quality × budget.

Circle already ships the naive version (`circlefin/arc-nanopayments`: one seller, no choice,
no budget). **The router is the submission.** Budget ~20% plumbing / 80% router + dashboard.

## Locked decisions

| Item | Decision |
|---|---|
| Providers | **Mixed**: 2 real tiers + 1 deliberately degraded (on-demand fallback demo) |
| Router | **Hybrid**: deterministic score shortlists → LLM picks + emits human-readable reason |
| Scaffold | Fresh pnpm monorepo; Circle sample as reference only (no Supabase/LangChain) |
| Network | Arc Testnet `eip155:5042002` · facilitator `https://gateway-api-testnet.circle.com` |
| Store | SQLite (better-sqlite3). No hosted DB. |

## Phases

| # | Phase | Days | Status |
|---|---|---|---|
| 01 | [Scaffold, wallets, SDK spike](phase-01-scaffold-wallets-sdk-spike.md) | Jul 26-27 | ☐ Not started |
| 02 | [Seller services behind x402](phase-02-seller-services-x402-paywall.md) | Jul 27-28 | ☐ Not started |
| 03 | [Buyer agent + payment loop](phase-03-buyer-agent-payment-loop.md) | Jul 29-30 | ☐ Not started |
| 04 | [Router: deterministic scoring](phase-04-router-deterministic-scoring.md) | Jul 31-Aug 1 | ☐ Not started |
| 05 | [Router: LLM decision + reasons](phase-05-router-llm-decision-layer.md) | Aug 2-3 | ☐ Not started |
| 06 | [Budget guard + batch settlement](phase-06-budget-guard-batch-settlement.md) | Aug 3-4 | ☐ Not started |
| 07 | [Dashboard](phase-07-dashboard.md) | Aug 5-6 | ☐ Not started |
| 08 | [Submission: video, deck, hardening](phase-08-submission-hardening.md) | Aug 7-9 | ☐ Not started |

Two days of slack are deliberately absent; phases 04/05 are the differentiator and will
overrun. Cut scope from 07 (dashboard polish), never from 04/05.

## Do today, before anything else

1. `git init`, push public repo, **submit Checkpoint 2** (repo link + progress summary). Due today AoE.
2. Request Arc Testnet USDC at `https://faucet.circle.com`. **~1 USDC/day is the hard rate limiter**
   (≈1,000 calls at $0.001). Request every day from now on; it does not backfill.

## Key dependencies & risks

- **Faucet drip is the throughput ceiling.** Daily requests start day 1 or the demo starves.
- **SDK surface is UNVERIFIED**: the `@circle-fin/x402-batching` API was read from a blog post, not from
  the package. Phase 01 spike must confirm before phases 02-03 are built on it. If it diverges,
  phases 02/03 estimates are void; re-plan rather than push through.
- **Differentiation, not infra, is the risk.** Every phase must visibly serve the router story.
- Circle facilitator may meter/rate-limit testnet calls (undocumented). Detect in phase 01.

## Unresolved questions

1. Judging weights are unpublished (criteria public, numbers not). Assume equal weighting.
2. Can 3 providers be compared legibly in a 3-min video under batch-settlement timing?
   Spike in phase 06, before the video is scripted.
3. Do the two real providers need separate API keys/spend approval from the user? Phase 02 blocker.
