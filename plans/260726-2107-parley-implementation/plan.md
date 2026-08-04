---
title: "Parley: negotiating agents with hard guardrails on Arc"
description: "Buyer and seller agents haggle over bulk inference capacity inside deterministic owner limits, then settle in USDC on Arc."
status: pending
priority: P1
effort: 6d
branch: main
tags: [hackathon, arc, x402, negotiation, agents]
created: 2026-08-03
---

# Parley Implementation Plan

**Spec:** [`spec.md`](../../spec.md) · **Track:** Agentic Economy
**Replanned:** 2026-08-03 against the real remaining budget: **6 days, zero code written.**
**Supersedes:** `plans/260726-2047-pay-per-answer-implementation/` (multi-provider router idea)
**Mode:** GATED: pause for owner review at every phase boundary.

## Deadlines

| | |
|---|---|
| Checkpoint 2 (mid) | Submitted Mon 27 Jul |
| Registration closes | 8 Aug |
| **Target submit** | **Sat 8 Aug**, one day early. Platform locks at the deadline. |
| Final deadline | Sun 9 Aug (AoE) |
| Demo Day | Thu 20 Aug |

> **Calendar note for the owner:** 3 Aug 2026 is a Monday, so **8 Aug is a Saturday, not a Friday.** Earlier drafts said "Fri 8 Aug". The target is unchanged (submit 8 Aug); only the weekday label was wrong.

## Scope decision (2026-08-03)

Six days remain with zero application code. Scope is cut to the **critical path**:

- **Phase 09 (reputation layer) is CUT.** Reason: spec section 13's own gate is "may only start if phases 01-07 are complete and on schedule". On day one of six, with nothing built, that gate is already unmet. Scenario D goes with it. The concept survives as a "future work" line in the README.
- **Phase 06 (settlement) folded to minimum viable form:** settle on ACCEPT, post-mortems on WALK_AWAY. No batch-flush UI, no settlement state machine beyond three states.
- **Phase 07 (dashboard) minimal:** six panels, one screen, no polish.
- **Phase 08 (submission) thin:** deploy or document, README, 3-min video, deck.

**Effort split:** roughly 20% plumbing, 80% negotiation engine plus dashboard. Phases 03 to 05 are the submission.

## Phases

| # | Phase | Day | Status |
|---|---|---|---|
| 01 | [Scaffold, wallets, SDK spike](phase-01-scaffold-wallets-sdk-spike.md) | Mon 3 Aug | Complete |
| 02 | [Negotiation protocol + agent skeletons](phase-02-negotiation-protocol-agent-skeletons.md) | Tue 4 Aug | Complete |
| 03 | [Guardrail engine (hard clamps)](phase-03-guardrail-engine-hard-clamps.md) | Wed 5 Aug | Complete |
| 04 | [Deterministic negotiation: utility, concession, ZOPA](phase-04-deterministic-negotiation-utility-concession-zopa.md) | Thu 6 Aug | Complete |
| 05 | [LLM layer + rationale log](phase-05-llm-layer-rationale-log.md) | Fri 7 Aug am | Complete (wired 4 Aug; demo mode `replay`) |
| 06 | [Settlement + walk-away reporting](phase-06-settlement-and-walkaway-reporting.md) | Fri 7 Aug pm | Stub complete; **real path code complete 4 Aug, awaiting faucet funding** |
| 07 | [Dashboard (minimal)](phase-07-dashboard-minimal.md) | Sat 8 Aug am | Complete (4 Aug) |
| 08 | [Submission hardening (thin)](phase-08-submission-hardening.md) | Sat 8 Aug pm | Not started |
| ~~09~~ | ~~Reputation layer (spec section 13)~~ | | **CUT 2026-08-03** |

## Honest fit assessment

**This does not comfortably fit.** Eight phases in six days, zero code written, an unverified payment SDK, and no Circle credentials in the repo. It fits only if every timebox in the phase files is respected and the gates below are answered fast.

**Cut order if anything slips** (apply in order, do not improvise):

1. Phase 07 degrades to the phase 02 terminal transcript renderer; shoot the video against it.
2. Phase 06 ships stub-only settlement with a visible `SIMULATED` badge.
3. Phase 05 ships `LLM_MODE=rationale-only`, then `off` with templated rationales.
4. Phase 04 drops the terms-for-price trade heuristic; price-only negotiation.

**Never cut:** phase 03's property tests (the safety claim), and **scenario C** (no ZOPA, both walk away, no payment). Scenario C is the proof the guardrails bind.

## Key architectural decisions

| Decision | Choice | Rationale |
|---|---|---|
| One process or two services (spec open question 2) | **DECIDED 2026-08-03 by owner: ONE process** with a transport-agnostic `MessageBus` boundary | Two services costs ~half a day of six. The bus interface plus per-party private guardrail stores buys most of the "independent parties" credibility, and an HTTP bus implementation can be added later without touching agent code. **Owner may override at the phase 02 gate.** |
| Settlement coupling | Behind a `SettlementAdapter` interface with a deterministic local stub, from phase 01 | No `.env`, no `CIRCLE_API_KEY`, no entity secret exists in the repo. Real settlement is blocked. This keeps phases 02 to 05, the actual differentiator, buildable and demoable while credentials are pending. |
| SDK trust | Phase 01 runs a 90-minute spike reading the **installed package**, not the blog post | The assumed `@circle-fin/x402-batching` surface is unverified. **If it diverges, re-plan 02 and 06 rather than push through.** |
| ZOPA detection | Two detectors: agent-side inference from revealed offers only, plus an observer-side oracle for the dashboard | Preserves the information asymmetry the spec requires. No agent may import the oracle; enforced by test. |

## Key risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **No Circle credentials all week** | High | Medium | Settlement adapter plus stub (phase 01). Phases 02 to 05 unaffected. Ship with an honest `SIMULATED` badge. |
| Schedule does not fit | High | High | Timeboxes in every phase file; the cut order above; submit Sat not Sun. |
| SDK surface diverges from research | Medium | High | Phase 01 spike, with an explicit stop-and-re-plan instruction. |
| LLM negotiates past guardrails | Low | Critical | Impossible by construction: deterministic clamp plus an independent bus-egress guard, both property-tested (phase 03). |
| Scenario B converges trivially and the engine looks pointless | Medium | Medium | Tuned narrow ZOPA, benchmarked against the phase 02 fixed-concession baseline. |
| ~~Faucet drip ~1 USDC/day~~ **RETIRED 2026-08-03** | Low | Low | Real rate is ~20 USDC per request, every 2 hours, per address. Funding is not a constraint. |
| A stubbed settlement presented as real | Low | Critical | `isStub` badge in the UI, adapter factory fails loudly instead of downgrading, checklist item in phase 08. |

## Open questions

1. ~~**One process or two services?**~~ ANSWERED at the phase 02 gate: one process with a message-bus boundary.
2. ~~**Will Circle credentials exist by Fri 7 Aug?**~~ **SUPERSEDED, then ANSWERED 2026-08-03.** The phase 01 spike showed settlement needs no Circle API key at all, only a funded EVM private key. At the phase 06 gate no wallet had been provisioned (the six **wallet** entries in `.env` are still placeholders; `LLM_API_KEY` is a real working key and unrelated to settlement), so **phase 06 shipped COMPLETE-ON-STUB.** Reopening it costs one faucet request plus the adapter implementation; it is a phase 08 stretch, not a blocker.
3. ~~**Does `@circle-fin/x402-batching` expose settlement status or a manual flush?**~~ ANSWERED by the phase 01 spike: status yes (`getTransferById`), manual flush no.
4. **Is a plain USDC transfer on Arc an acceptable settlement fallback** if Nanopayments is unusable on testnet from this SDK version? Still open, but no longer on the critical path: it only matters if the owner chooses to reopen real settlement.
5. Judging weights unpublished; assuming equal.
