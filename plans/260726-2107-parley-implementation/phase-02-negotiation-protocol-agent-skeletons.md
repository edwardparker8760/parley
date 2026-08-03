# Phase 02: Negotiation Protocol and Agent Skeletons

## Context Links

- Plan: [`plan.md`](plan.md)
- Spec: [`../../spec.md`](../../spec.md) sections 4, 9, 12.2
- Depends on: [`phase-01-scaffold-wallets-sdk-spike.md`](phase-01-scaffold-wallets-sdk-spike.md)
- Feeds: [`phase-03-guardrail-engine-hard-clamps.md`](phase-03-guardrail-engine-hard-clamps.md)

## Overview

- **Priority:** P0
- **Status:** COMPLETE 2026-08-03. All five success criteria met. Phase 03 unblocked.
- **Day:** Tue 4 Aug
- **Brief:** Message envelope, alternating turn loop with a hard round cap, message bus boundary, SQLite transcript store, and two agent skeletons that talk using deliberately dumb fixed-concession logic. No guardrails and no LLM yet. The point is a running conversation that terminates.

## Key Insights

- **Architecture decision to be ratified at this phase's entry gate (spec open question 2 / plan open question 2): ONE process, with a transport-agnostic message bus boundary.**
  - Recommendation: one process. Two HTTP services costs roughly half a day of the six remaining, and buys credibility ("independent parties") that a message-bus boundary plus separate private guardrail stores already buys most of.
  - The compromise that preserves both: agents communicate **only** through a `MessageBus` interface (`publish`, `subscribe`). The default implementation is `in-process-message-bus.ts`. An `http-message-bus.ts` can be added later without touching agent code, because agents never import each other and never share a memory reference to the counterparty's guardrails.
  - Credibility is preserved structurally: each agent owns a private `GuardrailStore`, and there is a lint-enforced rule that neither agent module may import the other's guardrail module.
  - **This is a recommendation, not an assumption. The owner may override at the gate.** If overridden to two services, add half a day and cut phase 07 to a terminal transcript renderer.
- Fixed-concession logic here is a **baseline**, not throwaway. Phase 04 benchmarks the real engine against it on scenarios A, B, C. Keep it.
- Every message must persist with the deterministic state that produced it (spec section 4). Design the row shape now; retrofitting it after the LLM lands is painful.
- The transcript is the primary artefact of the whole project. It has to be replayable from SQLite alone, with no live process.

## Requirements

**Functional**

1. Message envelope with four types: `OFFER`, `COUNTEROFFER`, `ACCEPT`, `WALK_AWAY`. Zod-validated on both publish and receive.
2. Alternating turn loop. Buyer opens. Hard round cap enforced by the loop, not by either agent.
3. Round cap breach emits `WALK_AWAY` with reason `ROUND_CAP_REACHED` from whichever side is on turn. The negotiation always terminates.
4. SQLite ledger with tables: `negotiations`, `messages`, `decision_states`. Every message row carries the JSON snapshot of the deterministic state that produced it.
5. Two agent skeletons (buyer, seller) driven by fixed-percentage concession toward a hardcoded target. No guardrail enforcement yet.
6. A scenario runner that loads a scenario config (A, B, C) and runs a full negotiation to termination, printing the ladder to stdout.
7. Replay: `pnpm replay <negotiationId>` reconstructs and prints the full ladder from SQLite with the process cold.

**Non-functional**

- Every module under 200 lines.
- The turn loop is deterministic given a seed. No wall-clock or `Math.random` in decision paths; inject a seeded RNG.
- No agent module imports the other agent's guardrail or state module.

## Architecture

```
packages/
├── protocol/
│   ├── src/message-envelope-schema.ts        # zod schemas + discriminated union
│   ├── src/message-bus-interface.ts          # publish / subscribe, transport agnostic
│   ├── src/in-process-message-bus.ts         # default impl
│   └── src/walk-away-reason-codes.ts
├── ledger/
│   ├── src/sqlite-connection.ts
│   ├── src/schema-migrations.ts              # plain SQL strings, applied in order
│   ├── src/negotiation-repository.ts
│   ├── src/message-repository.ts
│   └── src/transcript-replay.ts
├── agents/
│   ├── src/agent-interface.ts                # decide(inbound, context) -> outbound
│   ├── src/buyer-agent.ts
│   ├── src/seller-agent.ts
│   └── src/fixed-concession-baseline-strategy.ts
└── orchestrator/
    ├── src/negotiation-turn-loop.ts          # owns the round cap, alternation, termination
    ├── src/scenario-definitions.ts           # A, B, C configs
    └── src/run-scenario-cli.ts
```

**Message envelope**

```ts
type Party = 'BUYER' | 'SELLER';

interface Envelope {
  negotiationId: string;
  round: number;          // 1-based, increments per full exchange
  seq: number;            // strictly increasing per negotiation
  from: Party;
  type: 'OFFER' | 'COUNTEROFFER' | 'ACCEPT' | 'WALK_AWAY';
  offer?: { unitPriceMicroUsdc: string; quantity: number;
            terms: { deliveryWindowHours: number; slaTier: SlaTier } };
  acceptsSeq?: number;    // ACCEPT only
  reasonCode?: WalkAwayReason;  // WALK_AWAY only
  rationale: string;      // <= 240 chars, human readable; phase 05 makes it LLM-written
  createdAt: string;      // ISO
}
```

`unitPriceMicroUsdc` is a decimal **string** on the wire because bigint is not JSON-serialisable. Parse to bigint at the boundary, once, in the schema.

**Walk-away reason codes** (fixed set, extended in phase 04):
`ROUND_CAP_REACHED`, `NO_ZOPA_PRICE`, `NO_ZOPA_QUANTITY`, `NO_ZOPA_BUDGET`, `UTILITY_BELOW_RESERVATION`, `COUNTERPARTY_STALLED`.

**Data flow per turn**

```
turn-loop ──inbound envelope──► agent.decide()
                                   │  reads: own guardrails (private), own history, round budget
                                   │  produces: outbound envelope + decisionState snapshot
                                   ▼
                    message-bus.publish(outbound)          [phase 03 inserts an egress guard here]
                                   ▼
                    message-repository.insert(envelope, decisionState)
                                   ▼
                    turn-loop: terminal? (ACCEPT | WALK_AWAY | round > cap) → stop, else flip party
```

**Ledger schema (minimum viable, extended in 03/05/06)**

- `negotiations(id TEXT PK, scenario TEXT, status TEXT, round_cap INT, started_at, ended_at, outcome TEXT)`
- `messages(id INTEGER PK, negotiation_id, seq INT, round INT, from_party, type, offer_json, reason_code, rationale, created_at)` with `UNIQUE(negotiation_id, seq)`
- `decision_states(message_id INTEGER PK, state_json TEXT)` one to one with `messages`

Splitting `decision_states` out keeps `messages` cheap to read for the dashboard while the audit payload stays complete.

## Related Code Files

**Create**

- `packages/protocol/src/message-envelope-schema.ts`
- `packages/protocol/src/message-bus-interface.ts`
- `packages/protocol/src/in-process-message-bus.ts`
- `packages/protocol/src/walk-away-reason-codes.ts`
- `packages/ledger/src/sqlite-connection.ts`
- `packages/ledger/src/schema-migrations.ts`
- `packages/ledger/src/negotiation-repository.ts`
- `packages/ledger/src/message-repository.ts`
- `packages/ledger/src/transcript-replay.ts`
- `packages/agents/src/agent-interface.ts`
- `packages/agents/src/buyer-agent.ts`
- `packages/agents/src/seller-agent.ts`
- `packages/agents/src/fixed-concession-baseline-strategy.ts`
- `packages/orchestrator/src/negotiation-turn-loop.ts`
- `packages/orchestrator/src/scenario-definitions.ts`
- `packages/orchestrator/src/run-scenario-cli.ts`

**Modify**

- `packages/shared/src/domain-types.ts` (extend with `Party`, `NegotiationId`)
- root `package.json` (add `run:scenario`, `replay` scripts)

**Delete**

- `spike/` (its findings now live in `docs/x402-sdk-verified-surface.md`)

## Implementation Steps

1. **Entry gate:** get the owner's decision on one process versus two services. Record the answer in `plan.md`. Do not start coding until it is recorded.
2. Add `better-sqlite3` and `zod`. Nothing else. Keep the dependency surface tiny.
3. `message-envelope-schema.ts`: zod discriminated union on `type`. Refinements: `OFFER`/`COUNTEROFFER` require `offer`; `ACCEPT` requires `acceptsSeq`; `WALK_AWAY` requires `reasonCode`. `rationale` max 240 chars. Export `parseEnvelope` and `serialiseEnvelope`.
4. `message-bus-interface.ts`: `publish(env): Promise<void>`, `subscribe(party, handler): Unsubscribe`. Keep it async even in-process, so an HTTP implementation slots in with no signature change.
5. `in-process-message-bus.ts`: async fan-out with an ordering guarantee (single queue, sequential drain). No shared mutable state exposed to subscribers; deep-freeze or structured-clone each delivered envelope so an agent cannot mutate a message another agent holds.
6. `ledger`: `schema-migrations.ts` as an ordered array of SQL strings plus an applied-version table. Repositories are thin; no ORM.
7. `agent-interface.ts`: `decide(input: { inbound?: Envelope; history: Envelope[]; roundsRemaining: number }): Promise<{ outbound: Envelope; decisionState: unknown }>`. Guardrails are supplied at agent construction and never appear in the interface, keeping them private by construction.
8. `fixed-concession-baseline-strategy.ts`: move a fixed percentage (default 20%) of the gap between own last offer and the counterparty's last offer, per round. Accept if the counterparty's offer is at or better than own current target. This is the benchmark baseline for phase 04.
9. `buyer-agent.ts` and `seller-agent.ts`: thin wrappers over the strategy, differing only in direction of concession and in which guardrail record they hold. Keep the shared logic in the strategy module (DRY).
10. `negotiation-turn-loop.ts`: owns alternation, `seq`, `round`, the cap, and termination. **The cap is enforced here, outside both agents**, so neither agent can extend the conversation. On cap breach, synthesise `WALK_AWAY` with `ROUND_CAP_REACHED` attributed to the party on turn.
11. `scenario-definitions.ts`: three configs, wide / narrow / no ZOPA. Concrete starting numbers for bulk inference capacity:
    - **A (wide):** buyer max unit price 1200 micro-USDC, seller min unit price 700. Quantity target 10,000 calls, seller capacity 20,000. Cap 12 rounds.
    - **B (narrow):** buyer max 900, seller min 860. Quantity target 10,000, capacity 11,000. Cap 12 rounds.
    - **C (no ZOPA):** buyer max 600, seller min 950. Quantity target 10,000, capacity 20,000. Cap 12 rounds. Expected outcome: both walk away, no payment.
12. `run-scenario-cli.ts`: `pnpm run:scenario A` runs to termination and prints the ladder as an aligned table.
13. `transcript-replay.ts` plus a `replay` script: reconstruct the ladder from SQLite only.
14. Unit tests (vitest), five minimum: envelope schema rejects malformed messages; turn loop alternates; round cap always terminates; `seq` is strictly increasing and unique; replay output equals live output for the same negotiation.
15. `pnpm -r build` clean. Commit.

## Todo List

- [x] Owner decision recorded in `plan.md`: **ONE process** with a bus boundary
- [x] Envelope schema with zod, four message types, refinements
- [x] Walk-away reason codes enumerated
- [x] `MessageBus` interface plus in-process implementation with ordered delivery
- [x] SQLite connection, migrations, three tables
- [x] Negotiation and message repositories
- [x] Agent interface with guardrails held privately at construction
- [x] Fixed-concession baseline strategy (retained as phase 04 benchmark)
- [x] Buyer and seller agents
- [x] Turn loop owning alternation, seq, round cap, termination
- [x] Scenario A/B/C definitions with concrete numbers
- [x] `run:scenario` CLI prints the ladder
- [x] `replay` reconstructs the ladder from SQLite cold
- [x] Seven unit tests green (five required)
- [x] `spike/` deleted
- [x] Build clean, committed

## Outcome (2026-08-03)

**All five success criteria met.** A settles at round 10 (1045 micro-USDC,
inside the [700, 1200] band), B settles at round 12 at exactly the buyer's 900
limit after the limit visibly binds for eight rounds, C walks away with both
sides pinned at their limits. Each scenario runs in about 0.8s against a 5s
budget. Replay is byte-identical to the live ladder, verified both by test and
by CLI diff. No cross-agent imports.

**Deviation: `node:sqlite` instead of `better-sqlite3`.** The risk table
predicted a native-build problem on Windows and it happened: pnpm refused the
build script and a native compile was required. Node 24 ships `node:sqlite`
with prepared statements, parameterised queries and constraint enforcement,
which is everything the ledger needs, at zero dependencies and zero build step.
This was the documented fallback; taken inside the first 20 minutes as planned.

**Two real defects found by running the scenarios, both fixed:**

1. **Neither A nor B could ever settle.** Two sides each conceding a fixed
   fraction of the gap converge geometrically but never cross, so an
   acceptance rule of "at least as good as my next offer" alone can never
   fire. Fixed by adding two further acceptance paths: a negligible-gap
   threshold (2%) and last-round acceptance when the price clears our own
   limit. The limit check stays absolute and first, which is why C still walks
   away rather than taking a bad deal on the final round.
2. **The seller counteroffered its entire capacity** (20,000) rather than the
   10,000 the buyer asked for, so the two sides quoted totals for different
   amounts of goods and the ladder was incoherent. Fixed with an explicit
   `quantityRole`: the buyer REQUESTS, the seller SUPPLIES `min(request,
   capacity)`.

**Usability fix:** re-running a scenario against a persisted database collided
on the negotiation primary key. An implicit id now takes the next free
suffix; an explicit id is still used verbatim so tests stay deterministic.

**Note for phase 04:** the baseline converges late (round 10 of 12 on the wide
ZOPA). That is correct and useful. It is the number the real engine has to
beat.

## Success Criteria

1. `pnpm run:scenario A`, `B`, and `C` each terminate in under 5 seconds with a printed ladder and a terminal message type.
2. No scenario runs past its round cap. Proven by an automated test that runs all three plus a hostile agent that always counteroffers.
3. `pnpm replay <id>` output is byte-identical to the live run's ladder for the same negotiation.
4. `grep` shows no import of a seller module from `buyer-agent.ts` or vice versa.
5. Five unit tests green.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Two-service decision arrives late and forces rework | Medium | Medium | The bus interface makes the change additive. Worst case is one new implementation file plus wiring. |
| Envelope shape churns once the LLM lands in phase 05 | Medium | Medium | `rationale` is already a first-class field with a length cap. Phase 05 only changes who writes it. |
| `better-sqlite3` native build fails on Windows/Node 24 | Medium | High | Test the install in the first 20 minutes. Fallback: `node:sqlite` built into Node 24, or `sql.js`. Do not let this eat the day. |
| Baseline concession logic converges trivially and hides phase 04's value | Medium | Low | Scenario B is tuned narrow on purpose. Phase 04 compares round counts and utilities against this baseline. |
| Round cap enforced inside agents by mistake | Low | High | Cap lives in the turn loop; test with a hostile agent that never accepts. |

**Rollback:** phase 02 adds new packages only and deletes `spike/`. Revert is a single commit plus restoring `spike/` from git history. Phase 01 artefacts are untouched.

**File ownership:** this phase owns `packages/protocol`, `packages/ledger`, `packages/agents`, `packages/orchestrator`. It touches `packages/shared` in one additive edit. No other phase runs concurrently.

## Security Considerations

- Guardrails are private per agent by construction: injected at construction, never in the message envelope, never on the bus, never logged in a shared channel.
- Envelope validation runs on **both** publish and receive, so a malformed or hostile message cannot reach agent logic.
- `rationale` is untrusted text from here on. Length-capped at 240 chars, control characters stripped at parse time, and never interpolated into SQL (parameterised queries only). Phase 05 additionally forbids it from reaching any deterministic computation.
- SQLite file lives in a gitignored path.

## Next Steps

- **Unblocks:** phase 03 (needs the envelope and the bus egress point), phase 04 (needs the baseline to benchmark against), phase 07 (needs the ledger and replay).
- **Blocked by:** phase 01 (workspace, shared types).
- **Owner gate before phase 03:** confirm the scenario numbers in step 11 look like a plausible bulk-inference market.

## Unresolved Questions

1. One process or two services? Must be answered at this phase's entry gate. Recommendation above is one process with a bus boundary.
2. Should `round` increment per message or per full buyer-plus-seller exchange? Proposal: per full exchange, so "12 rounds" means 24 messages. Confirm, because the round cap headline number in the demo depends on it.
3. Are the scenario numbers in step 11 credible for bulk inference capacity? If the owner has a better price anchor, substitute it now rather than in phase 04.
