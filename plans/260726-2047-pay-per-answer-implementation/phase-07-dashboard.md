# Phase 07: Dashboard

**Context:** [plan.md](plan.md) · [phase-06](phase-06-budget-guard-batch-settlement.md)
**Priority:** P1 (how judges perceive the router)
**Status:** ☐ Not started
**Days:** Aug 5-6

## Overview

One screen that makes the router's reasoning visible: live routing decisions with reasons,
budget burn-down, per-provider spend and quality, batch settlement state.

## Key insights

- The dashboard does not add capability; it makes existing capability **legible**. Under a
  3-minute video, legibility is the whole game.
- Scope-cut target. If phases 04/05 overrun, cut polish here, never router work.
- One screen, not five. Judges will not click through tabs.

## Requirements

**Functional**
- Live decision feed: question, shortlist, chosen provider, **reason**, cost, latency, quality,
  and whether the LLM overrode the deterministic pick.
- Budget burn-down over the day, with the hard cap marked.
- Per-provider panel: spend, call count, quality EWMA, error rate, current price.
- Settlement panel: pending vs settled per provider with tx hashes linking to the Arc explorer.
- "Run benchmark" button that fires the 20-question set so a demo starts from one click.
- Degradation toggle for `frugal`, so fallback is triggerable live on camera.

**Non-functional**
- Updates within ~1s of a decision (SSE or 1s polling; polling is fine, YAGNI).
- Readable when screen-recorded at 1080p: large type, high contrast, no dense tables.

## Architecture

```
apps/dashboard/                  # Next.js
├── app/page.tsx                 # the single screen
├── app/api/state/route.ts       # snapshot from sqlite
├── app/api/events/route.ts      # SSE decision stream
└── components/
    ├── decision-feed.tsx
    ├── budget-burndown-chart.tsx
    ├── provider-comparison-panel.tsx
    └── settlement-panel.tsx
```

Reads the same SQLite ledger the buyer writes. No separate state.

## Related code files

**Create:** `apps/dashboard/**` (above)
**Modify:** `apps/buyer/src/server.ts` (emit decision events; expose benchmark trigger)

## Implementation steps

1. Next.js app + Tailwind. Dark, high contrast, large type, built for a screen recording.
2. `/api/state`: snapshot of budget, provider stats, recent decisions, settlement state.
3. `/api/events`: SSE stream of routing decisions.
4. `decision-feed.tsx`: newest first; the **reason string is the visual hero** of each row;
   badge when the LLM overrode the deterministic pick.
5. `budget-burndown-chart.tsx`: spend over time with the cap line. Activate the `dataviz` skill
   before writing any chart code.
6. `provider-comparison-panel.tsx`: three columns, one per provider, live stats. `frugal` shows
   an honest "fault injection" badge when degraded.
7. `settlement-panel.tsx`: pending vs settled, tx hashes linking to the Arc explorer.
8. Controls: run benchmark; toggle `frugal` degradation.
9. Record a 1080p test capture and check every number is readable on playback.

## Todo

- [ ] Next.js + Tailwind scaffold
- [ ] State snapshot + SSE endpoints
- [ ] Decision feed with reasons + override badges
- [ ] Budget burn-down chart (via `dataviz`)
- [ ] Provider comparison panel
- [ ] Settlement panel with explorer links
- [ ] Benchmark + degradation controls
- [ ] 1080p readability check passed

## Success criteria

Someone who has never seen the project watches the screen for 60 seconds and can state what
the agent is buying, why it picked that provider, and how much budget is left.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Dashboard polish eats router time | Hard cut line: ship it plain. Router work always wins. |
| Too dense to read on video | 1080p check at step 9, not on submission day. |
| SSE flakiness during the demo | 1s polling fallback. Reliability over elegance. |

## Security

- Dashboard is read-only except the two demo controls; both must be local/secret-guarded.
- Never render wallet keys or API keys. Addresses and tx hashes only.

## Next steps

Phase 08 turns this into the submission.
