# Parley phase status, 2026-08-04 10:36

**Branch:** main · **Head:** `398165c` · **Tests:** 63 pass, 0 fail (re-run just now) · **Build:** clean
**Prior detail report:** [`status-260803-1845-phase-01-to-06-progress.md`](status-260803-1845-phase-01-to-06-progress.md) (still accurate; read it for per-phase detail)

## Phase board

| # | Phase | Planned day | Status |
|---|---|---|---|
| 01 | Scaffold, wallets, SDK spike | Mon 3 Aug | Complete (`221a4fc`) |
| 02 | Protocol, ledger, agents, turn loop | Tue 4 Aug | Complete (`a684475`) |
| 03 | Guardrail engine, hard clamps | Wed 5 Aug | Complete (`a1d74e4`) |
| 04 | Deterministic negotiation | Thu 6 Aug | Complete (`218c42a`) |
| 05 | LLM layer + rationale log | Fri 7 Aug am | **Partial**: built and bounded, NOT wired into agents |
| 06 | Settlement + walk-away reporting | Fri 7 Aug pm | **Complete on stub** (no wallet provisioned) |
| 07 | Dashboard (minimal) | Sat 8 Aug am | Not started |
| 08 | Submission hardening | Sat 8 Aug pm | Not started |
| ~~09~~ | ~~Reputation~~ | | Cut 2026-08-03 |

Phases 01-04 ran ahead of their planned days; the schedule is currently **~3 days ahead of plan**
on the built phases, which is the entire buffer for 05 wiring plus 07 and 08.

## Since the last report

One commit, docs only: `398165c` narrowed an over-broad claim (only the six **wallet** entries in
`.env` are placeholders; `LLM_API_KEY` is real) and re-verified the Gemini latency run rather than
trusting the stored artifact. **No production code changed.** Everything in the 03 Aug report stands
without amendment.

## Verified now, not assumed

- `pnpm -r test`: settlement 4, guardrails 11, negotiation-engine 15, llm-layer 14, orchestrator 19.
  Total 63, zero failures.
- `.env` still has `LLM_MODE=off`, `LLM_PROVIDER=gemini`. So every rationale in a current ladder is
  the deterministic template, not the model. That is the phase 05 gap, unchanged.

## Critical path to submit (Sat 8 Aug)

1. **Phase 05 wiring, ~0.5d.** Selector between concession schedule and clamp, `llm_invocations`
   table, one `LLM_MODE=full` run per scenario, record the tape for the video. Pace calls: free tier
   is 15 req/min, an 18-call burst already hit `429` twice.
2. **Phase 07 dashboard, minimal.** Six panels, one screen.
3. **Phase 08 submission.** README, 3-min video, deck, honesty checklist (the `SIMULATED` badge must
   survive into the video).
4. Optional: reopen real settlement (provision wallet, faucet, `arc-x402` adapter, 402 endpoint).

Cut order if anything slips is unchanged and is in `plan.md`; never cut phase 03's property tests or
scenario C.

## Unresolved questions

1. Wire the LLM before or after the dashboard? Before means the transcript panel is styled once
   against real rationales; after risks styling it twice.
2. Reopen real settlement, or ship the stub with the `SIMULATED` badge? Stub is honest and free;
   real settlement is worth points on judging criterion 2.
3. Plain USDC transfer as fallback if Nanopayments is unusable on testnet? Only matters if 2 is
   "reopen".
