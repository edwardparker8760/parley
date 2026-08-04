# Pre-submit checklist

Run top to bottom. Submission is the only irreversible action in this project,
which is why this runs before it and not after.

Status column filled 2026-08-04. Items only a human can do are marked OWNER.

## Repository hygiene

| | Check | How | Status |
|---|---|---|---|
| 1 | `git status` clean | `git status --short` | PASS |
| 2 | No `.env*` tracked except `.env.example` | `git ls-files \| grep -E "^\.env"` | PASS: only `.env.example` |
| 3 | No AI attribution anywhere in history | `git log --format=%B \| grep -icE "co-authored-by: claude\|generated with\|claude code"` | PASS: 0 |
| 4 | Author identity correct on every commit | `git log --format="%an <%ae>" \| sort -u` | PASS: `edwardparker8760 <edwardparker8760032@gmail.com>` only |
| 5 | Zero em-dash and en-dash | `grep -rlP '[\x{2013}\x{2014}]'` over tracked files | PASS: 0 |
| 6 | No secrets committed | grep for `sk-`, `AIza`, `gho_`, `0x` + 64 hex, `CIRCLE_API_KEY=<value>` | PASS: 0 |
| 7 | No mainnet configuration | grep for `gateway-api.circle.com`, mainnet chain ids | PASS: testnet only |
| 8 | Repo is public | `gh repo view --json visibility` | PASS: PUBLIC |

## Clean clone

| | Check | Status |
|---|---|---|
| 9 | `git clone` to a fresh directory, `pnpm install` | PASS |
| 10 | `pnpm test` green, with a **non-zero** test count | PASS: 88 |
| 11 | `pnpm run:scenario C` runs and walks away | PASS |
| 12 | All three scenarios run | PASS |

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
| 15 | Captured-model test: zero out-of-band offers across A, B, C | PASS |
| 16 | Every stub settlement carries `SIMULATED` on screen | PASS: badge renders from the persisted `isStub` column |
| 17 | No README claim exceeds what runs | PASS: settlement stated as stub, LLM discretion stated as a 2% window |

## Video and submission

| | Check | Status |
|---|---|---|
| 18 | Screen cleared of anything key-bearing before recording | OWNER |
| 19 | Video recorded at 1920x1080, under 3:00 | OWNER |
| 20 | Watched back at full speed for a visible key | OWNER |
| 21 | Watched back for a stub presented as real | OWNER |
| 22 | Circle tools named aloud: Arc, Gateway, Nanopayments/x402, facilitator | OWNER, scripted in `demo-video-script.md` |
| 23 | Video publicly viewable | OWNER |
| 24 | Deck updated and accessible without login | OWNER |
| 25 | Pushed to `origin/main` | OWNER |
| 26 | Submitted on the Encode platform | OWNER |

## Before recording

Close, specifically:

- every editor window, in case `.env` is in a tab
- every terminal with scrollback that touched `.env`, `provision-wallets`, or a
  faucet page
- every browser tab except the dashboard
- notification popups

Then `pnpm --filter @parley/dashboard start` in a fresh terminal, and confirm the
only thing on screen is `http://localhost:4020`.

## Known-good demo commands

```bash
pnpm --filter @parley/dashboard start          # the screen
pnpm --filter @parley/orchestrator test        # the safety proof, 26 tests
pnpm run:scenario C                            # terminal fallback if the UI dies
```

## Unresolved questions

1. Video host: unlisted YouTube assumed unless the platform specifies.
2. Whether a deployed URL is required for "working frontend and backend". If so,
   deploy with `SETTLEMENT_MODE=local-stub` and no funded wallet behind it.
