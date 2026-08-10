# Pre-submit checklist

Run top to bottom. Submission is the only irreversible action in this project,
which is why this runs before it and not after.

Status column filled 2026-08-04, re-checked 2026-08-07 after the first real
settlement. Items only a human can do are marked OWNER.

## Repository hygiene

| | Check | How | Status |
|---|---|---|---|
| 1 | `git status` clean | `git status --short` | PASS |
| 2 | No `.env*` tracked except `.env.example` | `git ls-files \| grep -E "^\.env"` | PASS: only `.env.example` |
| 3 | No AI attribution anywhere in history | `git log --format=%B \| grep -icE "co-authored-by: claude\|generated with\|claude code"` | PASS: 0 |
| 4 | Author identity correct on every commit | `git log --format="%an <%ae>" \| sort -u` | PASS: `edwardparker8760 <edwardparker8760032@gmail.com>` only |
| 5 | Zero em-dash and en-dash | `grep -rlP '[\x{2013}\x{2014}]'` over tracked files | PASS: 0 |
| 6 | No secrets committed | grep for `sk-`, `AIza`, `gho_`, `0x` + 64 hex, `CIRCLE_API_KEY=<value>` | PASS: the only 64-hex strings are the published terms hash and transaction hash, which are public by design. A private key would be 64 hex too, so this check must be read, not just counted |
| 7 | No mainnet configuration | grep for `gateway-api.circle.com`, mainnet chain ids | PASS: testnet only |
| 8 | Repo is public | `gh repo view --json visibility` | PASS: PUBLIC |

## Clean clone

| | Check | Status |
|---|---|---|
| 9 | `git clone` to a fresh directory, `pnpm install` | PASS |
| 10 | `pnpm test` green, with a **non-zero** test count | PASS: 148, re-run 2026-08-09. The count grew from 125 as the dashboard tests were added, and the README said 125 until this run caught it |
| 11 | `pnpm run:scenario C` runs and walks away | PASS |
| 12 | All three scenarios run | PASS |
| 12a | **Every command written in the README, this file and the video script actually runs** | PASS 2026-08-07, after failing. `pnpm --filter @parley/dashboard start` was documented in four places and that package no longer exists, so the first command a stranger runs failed. The dashboard URL was wrong too: it is `/app`, not `/`. Checked by running them, not by reading them |

> Item 10 says "non-zero" because it was the bug this checklist caught. `pnpm
> test` used to run `node --test dist/*.test.js` with no `dist` present: zero
> tests, exit 0, green. A clean clone reported success while verifying nothing.
> Fixed by building on install. A checklist item that only asks "is it green"
> would have passed the broken version.

## Product claims

| | Check | Status |
|---|---|---|
| 13 | Scenario C produces zero settlement calls | PASS: counting-spy test |
| 14 | Guardrail property tests green with visible counts | PASS: 11 guardrails, 26 orchestrator |
| 14a | Settlement adapter tests green | PASS: 14, including the batch-landing transition |
| 15 | Captured-model test: zero out-of-band offers across A, B, C | PASS |
| 16 | Every stub settlement carries `SIMULATED` on screen | PASS: badge renders from the persisted `isStub` column |
| 17 | No README claim exceeds what runs | PASS: one real settlement claimed and evidenced, everything else stated as stub, LLM discretion stated as a 2% window |
| 17a | The two settlement latencies are never conflated | PASS: README, deck, landing page and video script all state 857ms authorisation and 12m43s on-chain settlement separately |
| 17b | Every claim of a real payment says what is independently checkable, and links nothing that does not show it | PASS 2026-08-10, after failing. The README, deck and landing page all linked `0xcccd6d68` as the transfer. Checked against the chain: that transaction is Circle's own `submitBatch` from a Circle address, decodes to **zero** token transfers, and names neither 9.23 nor either wallet. The seller address has no on-chain token transfers at all. Now stated as: the payment moved inside Gateway's balance system, the buyer's Gateway balance fell by exactly 9,230,000 atomic units, and what an explorer independently shows is the 12.00 USDC deposit (`0x04dc69c7`) and Circle's batch (`0xcccd6d68`). A judge who clicks a link and finds nothing matching stops believing the rest |

## Video and submission

| | Check | Status |
|---|---|---|
| 18 | Screen cleared of anything key-bearing before recording | OWNER |
| 19 | Video recorded at 1920x1080, under 3:00 | OWNER |
| 20 | Watched back at full speed for a visible key | OWNER |
| 21 | Watched back for a stub presented as real | OWNER |
| 22 | Circle tools named aloud: Arc, Gateway, Nanopayments/x402, facilitator | OWNER, scripted in `demo-video-script.md` |
| 23 | Video publicly viewable | OWNER |
| 24 | Deck updated and accessible without login | PARTIAL: deck HTML and PDF both regenerated 2026-08-07 and current with the repo, which is public. OWNER still confirms the submission link opens logged out |
| 25 | Pushed to `origin/main` | PASS 2026-08-07 at `34097a1`. Re-run before submitting if anything changes |
| 26 | Submitted on the Encode platform | OWNER |

## Before recording

Close, specifically:

- every editor window, in case `.env` is in a tab
- every terminal with scrollback that touched `.env`, `provision-wallets`, or a
  faucet page
- every browser tab except the dashboard
- notification popups

Then `pnpm --filter @parley/web start` in a fresh terminal, and confirm the only
thing on screen is `http://localhost:4020/app`.

## Known-good demo commands

Verified against the running app on 2026-08-07, which is the only reason to
trust a command block in a checklist.

```bash
pnpm --filter @parley/web build                # required before `start`
pnpm --filter @parley/web start                # the screen, /app is the dashboard
pnpm --filter @parley/orchestrator test        # the safety proof, 26 tests
pnpm run:scenario C                            # terminal fallback if the UI dies
```

## Unresolved questions

1. Video host: unlisted YouTube assumed unless the platform specifies.
2. Whether a deployed URL is required for "working frontend and backend". If so,
   deploy with `SETTLEMENT_MODE=local-stub` and no funded wallet behind it.
