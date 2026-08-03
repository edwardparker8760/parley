# Phase 07: Dashboard (Minimal)

## Context Links

- Plan: [`plan.md`](plan.md)
- Spec: [`../../spec.md`](../../spec.md) section 7
- Depends on: [`phase-04-deterministic-negotiation-utility-concession-zopa.md`](phase-04-deterministic-negotiation-utility-concession-zopa.md) (oracle), [`phase-05-llm-layer-rationale-log.md`](phase-05-llm-layer-rationale-log.md) (rationales), [`phase-06-settlement-and-walkaway-reporting.md`](phase-06-settlement-and-walkaway-reporting.md) (receipts, post-mortems)

## Overview

- **Priority:** P2. **Minimal by decision.** This is the first thing cut if anything upstream slips.
- **Status:** Not started
- **Day:** Sat 8 Aug, morning
- **Brief:** One screen. Live transcript, convergence chart with audience-visible reservation lines, guardrail panel with clamp markers, settlement panel, scenario A/B/C launchers, walk-away post-mortems. Nothing else.

## Key Insights

- The convergence chart is the single highest-value pixel in the project. It is what makes the idea legible in ten seconds. Everything else on the screen is supporting evidence. If the morning goes badly, build the chart and the transcript and stop.
- **The reservation lines are the trap.** They must come from the orchestrator's observer oracle (phase 04), never from the message bus. If a reservation price ever reaches the dashboard by way of an envelope, the information-asymmetry claim is dead and a judge could spot it in the network tab. Enforce structurally: the SSE payload for reservation data comes from a separate `observer.*` event type that the agents cannot publish.
- Judging criterion 4 is "quality of execution over complexity". A small screen that is clean and correct beats a big screen that is half-wired. Deliberately do not build: settings UI, negotiation history list, guardrail editor, dark mode toggle, animations beyond a simple transition.
- A degraded fallback already exists and is already tested: the phase 02 `run:scenario` terminal renderer and `replay`. If the browser UI collapses on Saturday morning, the video can be shot against the terminal. Say this out loud now so nobody panics later.
- The dashboard renders untrusted model output (phase 05 stores raw responses). React escapes by default; the only way to break this is `dangerouslySetInnerHTML`. Do not use it anywhere.

## Requirements

**Functional**

1. Single route `/` renders all five panels plus the post-mortem panel (which appears only on walk-away).
2. Scenario launchers: three buttons (A, B, C) POST to `/api/run-scenario`, which starts a negotiation in the orchestrator and returns a negotiation id.
3. Live transcript: offer ladder in order, each row showing round, party, type, unit price, quantity, terms, rationale, and a clamp marker if a clamp bit that message.
4. Convergence chart: buyer price line and seller price line over rounds, plus two dashed **audience-only** reservation lines and a shaded ZOPA band when one exists.
5. Guardrail panel: both owners' limits side by side, each labelled "private to that side, shown to the audience only", with a running count of clamp bites per side.
6. Settlement panel: status `PENDING` / `SETTLED` / `FAILED`, amount, terms hash (truncated), explorer link when present, and a **`SIMULATED`** badge whenever `isStub` is true.
7. Post-mortem panel on walk-away: both sides' reason code, binding guardrail, final gap, rounds used, and `zopaExisted`.
8. Replay mode: `/?negotiation=<id>` renders a completed negotiation from the ledger with no live process.

**Non-functional**

- Every component file under 200 lines, kebab-case names.
- No chart library if the hand-rolled SVG works inside the timebox.
- No `dangerouslySetInnerHTML` anywhere. Enforced by a grep test.
- Works at 1920x1080 without scrolling, because that is the video's frame.

## Architecture

```
apps/dashboard/
├── app/page.tsx                                  # composes the panels only
├── app/api/run-scenario/route.ts                 # POST, starts a negotiation
├── app/api/negotiation-stream/route.ts           # SSE, streams events
├── app/api/negotiation/[id]/route.ts             # cold read for replay
├── components/live-transcript-ladder.tsx
├── components/convergence-price-chart.tsx        # hand-rolled SVG
├── components/guardrail-limits-panel.tsx
├── components/settlement-status-panel.tsx
├── components/walkaway-postmortem-panel.tsx
├── components/scenario-launcher-buttons.tsx
├── components/simulated-settlement-badge.tsx
└── hooks/use-negotiation-event-stream.ts
```

**Event stream contract** (orchestrator emits, dashboard consumes)

```
message.appended    { envelope, clampEvents[] }        <- from the bus, agent-visible data
settlement.updated  { status, amount, txHash?, isStub, explorerUrl? }
negotiation.ended   { outcome, postmortems[] }
observer.zopa       { exists, lo, hi, buyerReservation, sellerReservation }
```

`observer.zopa` is emitted **only** by the orchestrator, only from the phase 04 oracle, and there is no code path by which an agent can publish it. That separation is the whole point of the event-type split.

**Data flow**

```
scenario button ─► POST /api/run-scenario ─► orchestrator starts turn loop
                                                  │
                    ┌─────────────────────────────┤
                    │ per message: message.appended (+ clamp events)
                    │ once at start: observer.zopa
                    │ on terminal:  negotiation.ended, then settlement.updated
                    ▼
        SSE /api/negotiation-stream ─► use-negotiation-event-stream ─► panels

replay: GET /api/negotiation/[id] ─► ledger repositories ─► same panels, same props
```

Live and replay produce the same props shape, so every component is written once (DRY) and the replay path is not a second implementation.

## Related Code Files

**Create**

- All twelve `apps/dashboard/**` files listed above
- `packages/orchestrator/src/negotiation-event-emitter.ts` (typed emitter feeding SSE)
- `apps/dashboard/test/no-dangerous-html.test.ts`
- `apps/dashboard/test/reservation-data-source.test.ts`

**Modify**

- `packages/orchestrator/src/negotiation-turn-loop.ts` (emit events at each terminal and per-message point)
- `pnpm-workspace.yaml` (include `apps/*` if not already)

**Delete**

- Nothing.

## Implementation Steps

1. `create-next-app` into `apps/dashboard`, TypeScript, App Router, Tailwind. Delete the boilerplate page content immediately. Timebox setup to 20 minutes.
2. `negotiation-event-emitter.ts` in the orchestrator: a typed emitter with the four event types above. Wire it into the turn loop and the settlement hook.
3. `/api/negotiation-stream/route.ts`: SSE over a `ReadableStream`. Keep it simple; no reconnection logic, no backpressure handling. A single-user demo does not need them.
4. `/api/run-scenario/route.ts`: starts a scenario by name, returns the negotiation id. Reject unknown names.
5. `use-negotiation-event-stream.ts`: `EventSource`, accumulates into a single state object shaped exactly like the replay endpoint's response.
6. `live-transcript-ladder.tsx`: a table, newest at the bottom, auto-scrolled. Buyer rows left-tinted, seller rows right-tinted. Clamp markers as a small badge on the row with a tooltip showing proposed value versus clamped value. This badge is a headline demo element; make it visible at video resolution.
7. `convergence-price-chart.tsx`, timeboxed to 60 minutes: SVG viewBox scaled to round count on x and price range on y. Two solid polylines (buyer, seller), two dashed horizontal lines for the reservations labelled "audience view only", and a shaded rect for the ZOPA band when `observer.zopa.exists`. If this fights back past 60 minutes, install `recharts` and move on.
8. `guardrail-limits-panel.tsx`: two columns, buyer and seller limits, clamp-bite counters. Include the literal label "private to that side, shown here to the audience only" in the UI, so the asymmetry claim is made on screen rather than only in the video narration.
9. `settlement-status-panel.tsx` plus `simulated-settlement-badge.tsx`. The badge is amber, unmissable, and rendered whenever `isStub` is true. Explorer link rendered only when a real reference exists.
10. `walkaway-postmortem-panel.tsx`: two cards. Reason code as a heading, binding guardrail, final gap, rounds used, and a plain-language "a deal was never possible" line when `zopaExisted` is false. This panel carries scenario C, which is the non-negotiable demo.
11. `no-dangerous-html.test.ts`: grep every file under `apps/dashboard` for `dangerouslySetInnerHTML`; assert zero matches.
12. `reservation-data-source.test.ts`: assert no component imports anything from `packages/protocol` envelope types to source reservation values, and that reservation values arrive only via the `observer.zopa` event shape.
13. Run all three scenarios in the browser. Check the 1920x1080 frame fits without scrolling.
14. Commit.

## Todo List

- [ ] Next.js app scaffolded, boilerplate removed (20 min timebox)
- [ ] Typed negotiation event emitter in the orchestrator
- [ ] SSE stream route
- [ ] Run-scenario route with three named scenarios
- [ ] Event-stream hook producing replay-shaped state
- [ ] Live transcript ladder with rationales and clamp markers
- [ ] Convergence chart with two price lines and audience-only reservation lines (60 min timebox)
- [ ] ZOPA band shading when one exists
- [ ] Guardrail panel with clamp-bite counters and the asymmetry label
- [ ] Settlement panel with `SIMULATED` badge and explorer link
- [ ] Walk-away post-mortem panel
- [ ] Replay via `/?negotiation=<id>`
- [ ] `no-dangerous-html` test green
- [ ] `reservation-data-source` test green
- [ ] All three scenarios verified in the browser at 1920x1080
- [ ] Committed

## Success Criteria

1. Clicking A, B, or C runs a full negotiation with the ladder streaming live.
2. The chart shows two lines converging in A and B, and visibly failing to converge in C.
3. At least one clamp marker is visible in scenario B or C.
4. Settlement panel reaches `SETTLED` in A, with a `SIMULATED` badge if on the stub, or an explorer link if real.
5. Scenario C shows both post-mortems and **no** settlement panel activity.
6. `/?negotiation=<id>` reproduces a completed negotiation with the orchestrator stopped.
7. Both guard tests green.
8. Whole screen fits 1920x1080 without scrolling.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Upstream phases slip and the dashboard gets under two hours | **High** | Medium | Build order is transcript, then chart, then settlement, then guardrail panel, then post-mortems. Ship whatever is done; the terminal renderer is the fallback for the video. |
| Hand-rolled SVG chart eats the morning | Medium | High | 60-minute timebox, `recharts` fallback. |
| SSE flakiness during recording | Medium | Medium | Replay mode via the cold-read endpoint is not SSE-dependent. Record against replay if live streaming misbehaves. |
| Reservation values leak through an envelope during integration | Low | **High** | Separate `observer.zopa` event type, plus `reservation-data-source.test.ts`. |
| A stub settlement looks real on camera | Low | **Critical** | `SIMULATED` badge, unmissable colour, plus a checklist item in phase 08. |
| Next.js setup friction on Node 24 / Windows | Medium | Medium | 20-minute timebox. Fallback: a single static HTML page served by the orchestrator polling the cold-read endpoint. Ugly, sufficient, two hours cheaper. |

**Rollback:** the dashboard is a leaf. Deleting `apps/dashboard` leaves every test and the terminal demo path fully working. This is the cheapest thing in the repo to abandon, which is exactly why it is scheduled last.

**File ownership:** owns `apps/dashboard/**`. One additive edit to `negotiation-turn-loop.ts` for event emission.

## Security Considerations

- All rationale and post-mortem text rendered as escaped React text. `dangerouslySetInnerHTML` banned and grep-tested. Phase 05 stores raw untrusted model output, so this is a real XSS surface, not a theoretical one.
- Reservation prices are audience-facing on this screen by design (spec section 7) and must never traverse the message bus. Structural separation plus test.
- No secrets in the client bundle. The dashboard talks to the orchestrator's local API only; Circle and LLM keys stay server-side.
- `/api/run-scenario` accepts a scenario name from a fixed allowlist. No arbitrary guardrail input from the client, which would otherwise be a way to make the clamp look wrong.
- Local demo only, no auth. Note it in the README limitations; do not deploy it publicly with a funded wallet behind it.

## Next Steps

- **Unblocks:** phase 08 (the video is shot against this screen).
- **Blocked by:** phases 04, 05, 06 for data.
- **Owner gate before phase 08:** watch scenario B and scenario C on the screen and confirm they read clearly at video resolution. If they do not, fix the visual before scripting, not after.

## Unresolved Questions

1. Should the guardrail panel show exact numbers or bands only? Exact is more dramatic and more legible; it is also more likely to prompt "so the agents can see this?" from a judge. Proposal: exact, with the on-screen asymmetry label answering the question pre-emptively.
2. Should scenario D controls be present but disabled, signalling the cut reputation layer? Proposal: no. A disabled button invites a question about unfinished work.
3. Is a single screen enough at 1920x1080 with six panels, or does the transcript need its own scroll region? Likely yes for the transcript only. Decide when the ladder length is known from phase 04.
