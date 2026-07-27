# Phase 08: Submission (Video, Deck, Hardening)

**Context:** [plan.md](plan.md) · [phase-07](phase-07-dashboard.md)
**Priority:** P0 (an unsubmitted project scores zero)
**Status:** ☐ Not started
**Days:** Aug 7-9 (**final deadline Sun 9 Aug, AoE**)

## Overview

Turn a working system into a judged submission: functional MVP deployed on Arc, public repo,
3-minute video, deck. No placeholders; every link public and working.

## Key insights

- The platform **locks at the deadline and late finals cannot be judged**. Target Fri 8 Aug.
- The video is the artefact most judges actually consume. Budget real time for it; a rushed
  recording wastes two weeks of work.
- Circle ships the naive one-seller version. The pitch must draw the contrast in the first
  30 seconds or the work reads as a rebuilt sample.

## Requirements

**Functional**
- Public repo: README with architecture, setup, Arc network details, honest limitations.
- Deployed and reachable: sellers, buyer, dashboard.
- 3-min video: problem → routing decision with reason → budget pressure changing behaviour →
  live fallback → settlement.
- Deck covering problem, architecture, the router, results vs baseline, what's next.

**Non-functional**
- Cold clone → running in under 10 minutes from README alone.
- No secrets in the repo. Verify before making it public.

## Architecture

Deployment: sellers + buyer on Railway/Fly, dashboard on Vercel. Anything that reliably yields
public URLs. Activate the `deploy` skill.

## Related code files

**Create:** `README.md`, `docs/system-architecture.md`, `docs/demo-script.md`,
`.env.example` (complete)
**Modify:** all `package.json` (start scripts), deployment configs

## Implementation steps

1. **Secret scan** the repo before publishing. Activate `security-scan`. Non-negotiable.
2. README: what it is, why the router matters, architecture diagram (`mermaidjs-v11`),
   setup, Arc testnet config, **honest limitations** (`frugal` is fault injection; testnet only;
   faucet-limited). Judges reward candour over overclaiming.
3. Deploy sellers, buyer, dashboard. Verify from a machine that never ran them locally.
4. Fund the buyer wallet with several days of accumulated faucet USDC; a demo that runs dry
   on camera is fatal. Check balance the morning of recording.
5. `docs/demo-script.md`: beat-by-beat 3-min script, timed against the **measured** settlement
   latency from phase 06.
6. Record. Beats: 30s problem + contrast with the one-seller sample → 45s routing decisions with
   reasons → 45s budget pressure shifting provider choice → 30s live fallback via the degradation
   toggle → 30s settlement + results vs baseline.
7. Deck: problem, architecture, the router (the deterministic + LLM split), **quality-per-USDC
   vs baseline**, limitations, next steps.
8. **Submit Fri 8 Aug.** Then verify every link from a logged-out browser.
9. Tag a release; freeze. Only fix breakage after this point.

## Todo

- [ ] Secret scan clean
- [ ] README + architecture diagram + honest limitations
- [ ] All three services deployed, verified from a clean machine
- [ ] Buyer wallet funded for demo day
- [ ] Demo script timed against real settlement latency
- [ ] 3-min video recorded
- [ ] Deck
- [ ] **Submitted Fri 8 Aug**
- [ ] All links verified logged-out
- [ ] Release tagged

## Success criteria

Submitted a day early, every link works from a logged-out browser, and the video makes the
router's value obvious without narration explaining what to look at.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Deadline slip | Target Fri 8 Aug. Platform locks; late finals are unjudged. |
| Wallet dry on camera | Accumulate faucet USDC daily from phase 01. Check balance before recording. |
| Video overruns 3 min | Script and time it at step 5. Rehearse twice. |
| Secrets leaked in public repo | Step 1, before publishing. |
| Deploy fails late | Deploy at the *start* of this phase, not the end. |

## Security

- Full secret scan before the repo goes public.
- Rotate any key ever committed, even to a private repo.
- Degradation and benchmark controls must not be publicly triggerable on the deployed instance.

## Next steps

Demo Day Thu 20 Aug. Top 8 teams enter an 8-week accelerator.
