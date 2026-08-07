# Demo video script

**Target: under 3:00.** Record at 1920x1080. The dashboard is the whole visual;
no code is shown except one test run.

**Before you press record**, run `docs/pre-submit-checklist.md` section "Before
recording". One visible API key in a public video is unrecoverable.

## Setup, done before the take

```bash
pnpm --filter @parley/dashboard build
pnpm --filter @parley/dashboard start        # http://localhost:4020
```

Have a second terminal ready, cleared, in the repo root. Nothing else on screen:
no editor, no `.env` open anywhere, no browser tab but the dashboard.

Pre-run scenario A once so the ledger is warm; the demo runs are fresh.

Timings below assume the dashboard's own pacing: a negotiation streams one
message every 550ms, so scenario A is about 10 seconds of ladder and scenario C
about 9. Stub settlement resolves in 815ms (`docs/settlement-latency.md`).

## 0:00-0:20, the claim

Screen: dashboard, empty state.

> Two AI agents negotiate the price of bulk inference capacity. One buys, one
> sells. Their owners set hard limits in advance, and here is the part that
> matters: those limits are arithmetic, not instructions in a prompt. The model
> proposes. Arithmetic disposes. No prompt can talk an agent past its owner's
> limit, and I will show you that rather than assert it.

## 0:20-1:00, scenario B with the baseline agent

Screen: click **baseline**, then **Scenario B**. Let it stream.

> This is a narrow overlap. The blue line is the buyer walking up, orange is the
> seller walking down. The dashed lines are each side's private limit: neither
> agent can see the other's, the audience can see both.
>
> Watch the buyer hit its ceiling. Every red marker is the owner's limit
> overriding what the agent wanted to offer. It proposed 954, arithmetic sent
> 900. Nine times in this one negotiation.

Point at the "guardrail overrode the strategy **9** times" counter.

> They still close, at a price inside both limits.

## 1:00-1:25, the same scenario with the real engine

Screen: click **engine**, then **Scenario B** again.

> Same limits, better agent. The negotiation engine concedes on a schedule that
> never reaches the band edge, so it is clamped zero times. It stays inside its
> owner's limits by choice rather than by being stopped. The guardrail is still
> there; it just never has to fire.

## 1:25-1:55, scenario C, the proof

Screen: **Scenario C**.

> No overlap exists at all. The seller's floor is above the buyer's ceiling, and
> you can see it: the dashed lines never cross. Both agents work it for nine
> rounds, then walk away.
>
> Both sides file a post-mortem naming the limit that stopped them. And no
> payment is made. Not "a payment that failed": the settlement adapter is
> unreachable from the walk-away branch, and a counting test asserts scenario C
> makes exactly zero settlement calls.

## 1:55-2:20, the safety proof

Screen: second terminal.

```bash
pnpm --filter @parley/orchestrator test
```

> Here is the claim tested rather than argued. A model that answers every single
> prompt with an absurd price, ninety-nine million, across all three scenarios,
> puts zero out-of-band offers on the wire. Every refusal is logged with the
> number arithmetic threw away.
>
> Property tests over the band, an adversarial corpus, prompt injection through
> the counterparty's own rationale text. The band is computed before the model is
> consulted and re-checked twice after.

## 2:20-2:45, settlement and the Circle stack

Screen: **Scenario A**, let it settle, point at the settlement panel.

> They converge in nine rounds and settle. Circle's stack does the money:
> **Arc Testnet** is the chain, **Circle Gateway** holds the buyer's balance and
> signs, **Nanopayments x402 batching** runs the 402 flow between buyer and a
> 402-protected seller endpoint, and **Circle's x402 facilitator** verifies and
> settles the authorisation.
>
> And that amber badge is doing real work. This run is on the stub, so no money
> moved here and the screen says so. The real path has run once, off camera:
> 9.23 USDC on Arc Testnet, authorised in 857 milliseconds, batch settled on
> chain twelve minutes later.

## 2:45-3:00, close

> Circle's own starter shows an agent paying a fixed price. Parley's agents
> discover the price, inside limits a human set, and the limits hold whatever the
> model says. Testnet only, and the next thing is on-chain reputation so a
> seller's history survives across marketplaces.

## Cut order if the take runs long

1. The 1:00-1:25 engine-versus-baseline beat. It is the most interesting
   comparison and the least essential claim.
2. Trim the scenario B ladder; cut to the finished state.
3. Shorten the Circle stack list to naming the four tools without explanation.

**Never cut:** scenario C, the zero-out-of-band test, or the SIMULATED badge
sentence. The first two are the product and the third is the honesty.

## Unresolved questions

1. Where does the platform want the video hosted? Unlisted YouTube is the
   assumed default.
2. Is a documented local run enough for "working frontend and backend", or is a
   deployed URL required? If a URL is required, deploy with
   `SETTLEMENT_MODE=local-stub` and no funded wallet behind it.
