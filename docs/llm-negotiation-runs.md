# Live LLM negotiations: measured

**Date:** 2026-08-04 · **Provider:** Google Gemini `gemini-3.5-flash-lite` (free tier)
**Mode:** `LLM_MODE=full`, both agents, paced at one call per 4.3s

Every number here comes from a run executed on the date above. Nothing is
projected from the phase 05 latency measurement, which timed isolated calls
rather than negotiations.

## The three scenarios, live

| Scenario | Consultations | Median call | Wall clock | Outcome | Settled at |
|---|---|---|---|---|---|
| A wide ZOPA | 17 | 1045ms | **70.7s** | DEAL round 9 | 984 micro-USDC/call, 9.84 USDC |
| B narrow ZOPA | 23 | 1015ms | **96.5s** | DEAL round 12 | 858 micro-USDC/call, 8.58 USDC |
| C no ZOPA | 16 | 1106ms | **65.7s** | **WALK-AWAY round 9, no payment** | n/a |

Zero `429 RESOURCE_EXHAUSTED` across 56 live calls. The 2026-08-03 measurement
lost 2 of 18 calls to rate limiting; pacing is what closed that gap, and it is
also what makes the wall clock what it is.

## Same run, replayed from tape

| Scenario | Wall clock live | Wall clock replayed | Identical result |
|---|---|---|---|
| A | 70.7s | **0.8s** (settlement stub latency) | yes, same terms hash |
| B | 96.5s | **0.8s** | yes, same terms hash |
| C | 65.7s | **0.0s** | yes, same post-mortems |

A replay is a real run of the whole system: the agents, the bounded selector,
the clamp, the egress guard and the ledger all execute. Only the HTTP call is
served from the tape, keyed by prompt hash, so a stale tape misses loudly rather
than answering a question that was never asked.

## Demo mode decision (phase 05, step 13)

**The demo runs `LLM_MODE=replay`.** Phase 05's success criterion 6 requires
scenario A end to end in under 60 seconds; live `full` takes 70.7s, so live mode
fails that criterion and replay passes it with two orders of magnitude to spare.

The alternative in the plan's cut order was `rationale-only`, which would not
have helped: it makes the same number of calls and therefore takes the same time.
The cost is only in what it declines to use, not in what it spends.

Live `full` mode remains fully supported and is what cut the tapes. Nothing about
the demo path is faked: the tape contains real Gemini responses from the runs in
the first table.

## Effect of the LLM on the outcome

| Scenario | Deterministic (`off`) | Live LLM (`full`) | Delta |
|---|---|---|---|
| A | DEAL at 982, 18 messages | DEAL at 984, 18 messages | +2 micro-USDC |
| B | DEAL at 856, 24 messages | DEAL at 858, 24 messages | +2 micro-USDC |
| C | NO DEAL, 17 messages | NO DEAL, 17 messages | none |

That small delta is the design working, not the model failing to matter. The
model may move the price only inside a 2% window around the deterministic pick
(`LLM_WINDOW_BASIS_POINTS` in `packages/agents/src/llm-offer-consultation.ts`),
so it can colour the negotiation without overriding the concession schedule or
the owner's limits. What it changes wholesale is the prose: every rationale in a
live ladder is written by the model, against a templated sentence when it is off.

**Scenario C still walks away with the LLM on, and still pays nothing.** That is
the proof the guardrails bind, and it survives turning the model on.

## What the bounding looks like when the model misbehaves

The live runs produced 56 of 56 `ACCEPTED` outcomes: a well-behaved model asked
to pick inside a stated range picks inside it. That proves the happy path and
nothing else, so the refusal branches are proven by injected failure instead, in
`packages/orchestrator/src/bounded-llm-wiring.test.ts`:

- A model returning `99999999` on every call, across all three scenarios, puts
  **zero** out-of-band offers on the wire, and every refusal is recorded in
  `llm_invocations` with the price arithmetic threw away.
- Prose instead of JSON, and an empty response, both log `SCHEMA_INVALID` and
  fall back to a readable sentence.
- A timing-out model logs `TIMEOUT` and leaves the ladder identical to the
  deterministic run.
- Neither side's prompt contains any of the other side's private limits,
  including the seller's derived floor.

## Reproducing

```bash
# Live, and cut a fresh tape
LLM_MODE=full pnpm --filter @parley/orchestrator scenario A \
  --record-tape ../../docs/llm-tape-scenario-a.json

# Replay that tape
LLM_MODE=replay LLM_TAPE_PATH=../../docs/llm-tape-scenario-a.json \
  pnpm --filter @parley/orchestrator scenario A
```

## Unresolved questions

1. Tapes are keyed by prompt hash, so any change to the prompt builder or to the
   concession schedule invalidates all three and they must be re-cut. That is
   ~4 minutes of wall clock, but it must happen before the video, not after.
2. Rationale cap is 240 characters. Phase 07 may want 160 for the transcript
   panel; deciding after the panel is styled means re-cutting the tapes.
