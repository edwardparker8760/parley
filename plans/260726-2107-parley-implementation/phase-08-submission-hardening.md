# Phase 08: Submission Hardening (Thin)

## Context Links

- Plan: [`plan.md`](plan.md)
- Spec: [`../../spec.md`](../../spec.md) sections 1, 2, 11
- Judging criteria and submission requirements: [`../../context/latest.md`](../../context/latest.md) section (g)
- Existing deck: `docs/` (checkpoint-2 deck, to be updated not rewritten)
- Depends on: all prior phases, especially [`phase-06-settlement-and-walkaway-reporting.md`](phase-06-settlement-and-walkaway-reporting.md) for the measured latency figure

## Overview

- **Priority:** P1. Zero code value, total submission value. An unsubmitted project scores nothing.
- **Status:** **PREPARED 2026-08-04, awaiting the owner's video and submission.** Everything that
  is not a screen recording or a form submission is done and verified.

  **The clean-clone test earned its position as step 1.** It found that `pnpm test` reported
  **zero tests and exit 0** on a fresh clone: the test scripts ran `node --test ./dist/*.test.js`
  with no `dist` present, so a judge cloning the repo would have seen a green run that verified
  nothing. Fixed by building on install (root `prepare`) and by each package building before it
  tests. This is the same failure class as `docs/verification-must-not-silently-noop.md`.

  Also corrected: the README credited **Circle Developer-Controlled Wallets**, which the phase 01
  spike had already proven are not in the payment path at all. That was an overclaim on the
  highest-weighted judging criterion, and it is now stated accurately, including what is NOT used
  and why.

  **Deliverables:** `docs/demo-video-script.md` (timed against the dashboard's real 550ms pacing
  and the measured 815ms stub settlement), `docs/pre-submit-checklist.md` (26 items, 17 run and
  passing, 9 marked OWNER), `docs/final-submission-deck.html` plus a rendered PDF (7 slides, real
  screenshots, verified no slide overflows), README rewritten with a verified quickstart.

  **Left for the owner:** record the video, update any hosted copy of the deck, push, submit.
- **Day:** Sat 8 Aug, afternoon. **Submit Sat 8 Aug**, one day before the Sun 9 Aug AoE deadline. The platform locks at the deadline and late submissions cannot be judged.
- **Brief:** Deploy or document local run, rewrite README, record the 3-minute video, update the deck, run the pre-submit checklist, submit.

## Key Insights

- Submission requirements are fixed and non-negotiable: functional MVP with working frontend **and** backend, a 3-minute video covering core functionality **and** use of Circle tools, and a public code repository link.
- Judging criterion 2 (clear use of Circle developer tools) is the highest-leverage one. **Name each tool out loud in the video**: Wallets, Gateway, Nanopayments, x402, Arc Testnet. Do not assume the judge infers it from the code.
- Criterion 4 is "quality of execution over complexity". The video should show three scenarios working cleanly, not a tour of the architecture.
- **The opening 20 seconds decide the score.** Lead with the differentiator: Circle's own starter pays a fixed price; Parley's agents discover the price, and the LLM provably cannot escape the owner's limits.
- If settlement shipped on the stub, the video says so in one plain sentence. Overclaiming on a Circle hackathon, where judges will check the explorer, is worse than an honest limitation.
- Do not deploy the dashboard publicly with a funded wallet behind it. A documented local run plus the video is an acceptable read of "working frontend and backend" for a testnet agent demo; a public URL with an unauthenticated scenario launcher and a funded buyer wallet is a bad trade.

## Requirements

**Functional**

1. `README.md` rewritten: what it is, the guardrail claim, quickstart, architecture diagram, demo scenarios, Circle tools used, honest limitations, future work.
2. `.env.example` complete and accurate for a cold clone.
3. Quickstart verified by a **clean-clone test**: fresh directory, `git clone`, `pnpm install`, `pnpm test`, `pnpm run:scenario C`. If it does not work from a clean clone, it does not work.
4. 3-minute video recorded, under 3:00, covering core functionality and Circle tools by name.
5. Deck updated from the checkpoint-2 version in `docs/`.
6. Pre-submit checklist run and every item ticked.
7. Submission made on the Encode platform with the repo link, video link, and deck.

**Non-functional**

- No em-dash or en-dash anywhere in any deliverable, verified by grep before the final commit.
- No AI attribution in any commit message, PR, or code comment.
- No secrets in the repo or in any video frame.

## Architecture

Not applicable. This phase produces documents and media, not code.

Video structure, timings driven by the measured settlement latency in `docs/settlement-latency.md`:

| Time | Beat | Shows |
|---|---|---|
| 0:00-0:20 | The claim | "Two agents haggle over bulk inference capacity. Their owners set hard limits. The LLM proposes; arithmetic disposes." |
| 0:20-1:00 | Scenario B | Narrow ZOPA, the ladder streaming with rationales, late convergence, a clamp marker biting |
| 1:00-1:40 | The safety proof | Malicious LLM stub returning an absurd price, producing zero out-of-band messages; property-test output on screen |
| 1:40-2:15 | Scenario C | Both walk away, both post-mortems, **no payment**. State plainly that a deal was never possible. |
| 2:15-2:50 | Settlement | Scenario A settling on Arc Testnet, explorer link, Circle tools named: Wallets, Gateway, Nanopayments, x402 |
| 2:50-3:00 | Close | One line on path to production and the testnet limitation |

If the LLM layer shipped in `off` mode, the 1:00-1:40 beat gets stronger, not weaker: the claim becomes "the bounding is proven by construction and by property tests" and the property-test output carries it.

## Related Code Files

**Create**

- `docs/demo-video-script.md`
- `docs/pre-submit-checklist.md`

**Modify**

- `README.md` (full rewrite)
- `.env.example` (final audit)
- `docs/` deck (update from checkpoint-2)
- `plans/260726-2107-parley-implementation/plan.md` (final status marks)

**Delete**

- Any leftover scratch files, `.env.local.generated`, stale `*.db` files not gitignored

## Implementation Steps

1. **Clean-clone test first.** Clone the repo to a fresh directory, `pnpm install`, `pnpm test`, `pnpm run:scenario C`. Fix whatever breaks. Do this before writing the README, because it determines what the README has to say.
2. Rewrite `README.md`. Sections: title and one-line pitch, why it is not a payments demo, the core property (the LLM-proposes / arithmetic-disposes diagram already in the current README), quickstart, the three demo scenarios table, Circle tools used with what each does, honest limitations, future work (on-chain identity and sybil-resistant reputation, one line, per spec section 11).
3. Limitations section must state, plainly: Arc testnet only; faucet-limited; single good per negotiation; no counterparty identity or reputation; settlement binds terms via a payment reference hash and is not legal contract generation; prompts are sent to a third-party LLM API; **and, if applicable, settlement is simulated pending Circle credentials.**
4. Audit `.env.example`: every key the code reads, no values, no mainnet entries.
5. Write `docs/demo-video-script.md` from the table above, with the settlement beat's duration set by the measured latency. If settlement takes longer than 20 seconds, plan the cut rather than discovering it mid-take.
6. Record the video. Use the dashboard if phase 07 landed; use the terminal renderer plus the property-test output if it did not. **Close every terminal, editor tab, and browser tab that could show a key.** Record at 1920x1080.
7. Watch the recording once at full speed specifically checking for: a visible API key, a `SIMULATED` badge presented as real, and total runtime under 3:00.
8. Update the deck from the checkpoint-2 version: replace "plan" slides with "built" slides, add the property-test output screenshot, add the convergence chart, add a Circle-tools slide.
9. Run the pre-submit checklist (below), fixing anything it catches.
10. Final commit. Verify git identity is `edwardparker8760 / edwardparker8760032@gmail.com` per project CLAUDE.md, confirm the repo is public, push.
11. Submit on the Encode platform: repo link, video link, deck. **Submit Saturday, not Sunday.**
12. Mark all phases complete in `plan.md`.

## Todo List

- [x] Clean-clone test passes from a fresh directory **(found and fixed the vacuous-pass bug)**
- [x] `README.md` rewritten with quickstart, scenarios, Circle tools, honest limitations, future work
- [x] Settlement honesty line included: stub stated plainly, in three places
- [x] `.env.example` audited: no values beyond safe defaults, no mainnet, `PARLEY_LEDGER` added
- [x] `docs/demo-video-script.md` written with latency-driven timings and a cut order
- [ ] Screen cleaned of anything key-bearing before recording **(OWNER)**
- [ ] Video recorded, under 3:00, at 1920x1080 **(OWNER)**
- [ ] Video reviewed for leaked keys and for stub-presented-as-real **(OWNER)**
- [x] Circle tools named in the script: Arc, Gateway, Nanopayments/x402, facilitator
- [x] Deck rebuilt as `docs/final-submission-deck.html` plus PDF; checkpoint-2 kept as the record
- [x] Pre-submit checklist written and run: 17 automated items pass, 9 are the owner's
- [x] Git identity verified on every commit, repo confirmed public
- [ ] Pushed to origin **(OWNER, or say the word)**
- [ ] **Submitted** **(OWNER)**
- [x] `plan.md` final status marks

## Pre-Submit Checklist (`docs/pre-submit-checklist.md`)

- [ ] `git status` clean; no `.env*` tracked except `.env.example`
- [ ] `git log` contains no AI attribution and no "Generated with" lines
- [ ] Grep the whole repo for U+2014 and U+2013: zero matches
- [ ] Grep the repo for `sk-`, `CIRCLE_API_KEY=` with a value, and any 0x private key: zero matches
- [ ] `pnpm test` green from a clean clone
- [ ] All three scenarios run from a clean clone
- [ ] Scenario C produces zero settlement calls
- [ ] Phase 03 property tests green with case counts visible
- [ ] Every stubbed settlement carries the `SIMULATED` badge on screen and in the video narration
- [ ] Repo is public
- [ ] Video under 3:00 and publicly viewable
- [ ] Deck accessible without a login

## Success Criteria

1. A stranger can clone the repo and run scenario C in under five minutes using the README alone.
2. Video is under 3:00, shows all three scenarios, and names every Circle tool used.
3. Submission is on the platform by end of Sat 8 Aug, a full day before the deadline.
4. Pre-submit checklist has zero unticked items.
5. No item in the README overclaims relative to what actually runs.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Upstream slippage leaves no time for the video | **High** | **Critical** | Submit Saturday, not Sunday, so a bad Saturday still leaves Sunday. Script written before recording. Terminal-renderer fallback if the dashboard is not done. |
| Video overruns 3:00 | **High** | High | Script with timings, rehearse once, cut the settlement beat first (it is the least differentiating). |
| A key appears in a video frame | Medium | **Critical** | Explicit screen-clearing step, plus a full-speed review pass before upload. |
| Clean clone does not work | Medium | High | It is step 1, not step 9. |
| Platform locks earlier than expected or the upload fails | Low | **Critical** | Submitting a day early is the mitigation. There is no other one. |
| Overclaiming a stubbed settlement | Low | **Critical** | Checklist item plus README limitations line. |

**Rollback:** none applicable; this phase produces no runtime change. The only irreversible action is submission, which is why the checklist runs before it.

**File ownership:** owns `README.md`, `docs/demo-video-script.md`, `docs/pre-submit-checklist.md`, the deck, and the final `plan.md` marks.

## Security Considerations

- The highest-risk moment in the whole project is screen recording. One visible API key in a public video is unrecoverable. Clear the screen, then review the recording.
- Confirm no `.env` was ever committed, including in earlier history. If one was, it must be removed from history **before** the repo goes public, not after.
- Testnet-only claim must be accurate: grep for any mainnet RPC or chain id before submitting.
- The README limitations section is a security artefact as much as a marketing one: it is where "prompts go to a third-party API" and "no auth on the local dashboard" get stated honestly.

## Next Steps

- **Blocked by:** all prior phases, with a hard dependency on phase 06's latency measurement for the video script.
- **After submission:** Demo Day is Thu 20 Aug. The cut reputation layer (spec section 13) is the obvious thing to build in the gap if the project advances, and it makes a good "what's next" slide either way.

## Unresolved Questions

1. Is a documented local run acceptable for "working frontend and backend", or does the rubric require a live deployed URL? Section (g) of the research says "functional MVP: working frontend and backend" without specifying hosting. If a URL is required, deploy the dashboard with the scenario launcher pointed at a stub-settlement configuration only.
2. Does the platform require the video on a specific host? Unknown. Upload unlisted to YouTube as the safe default.
3. **Calendar check for the owner:** 8 Aug 2026 is a **Saturday**, not a Friday. The final deadline is Sun 9 Aug AoE. The plan targets submitting Sat 8 Aug. Confirm this matches the owner's intent.
