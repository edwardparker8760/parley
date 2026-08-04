# Parley

**Agents that haggle, with human-set limits and instant USDC settlement on Arc.**

Encode Club × Arc Programmable Money Hackathon · **Agentic Economy** track

---

## What it is

A buyer agent and a seller agent negotiate **price, quantity, and terms** with each other,
inside guardrails their human owners set in advance. Every offer and counteroffer is logged
live with the reasoning behind it. When they converge, the deal **auto-settles in USDC on Arc**
via x402/Gateway. When they don't, both walk away and each reports exactly why.

## Why it isn't a payments demo

Circle's `arc-nanopayments` starter shows an agent **paying a fixed price**. Parley's agents
**discover the price**. Settlement is the last step, not the product.

## The core property

Owner guardrails (max price, min margin, walk-away threshold) are **hard clamps enforced in
deterministic code**, not instructions in a prompt. The LLM proposes; arithmetic disposes.
No prompt can talk an agent past its owner's limits.

```
  LLM layer          picks where inside the band to land, writes the rationale
  ─────────────      ↑ bounded: schema-validated, out-of-band rejected, timeout → fallback
  Deterministic      utility · concession schedule · ZOPA detection · GUARDRAIL CLAMP
  ─────────────      ↑ nothing outside the feasible band ever ships
```

## Demo scenarios

| | Setup | Outcome |
|---|---|---|
| A | Wide ZOPA | Converges fast, settles on Arc |
| B | Narrow ZOPA | Converges late, after real concessions |
| C | **No ZOPA** | Both walk away and report why. No payment. |
| D *(stretch)* | Seller with bad review history | Buyer opens tougher, walks earlier |

Scenario C is the proof the guardrails bind. Scenario D ships only if the conditional
reputation layer makes the schedule (see `spec.md` §13).

## Stack

| | |
|---|---|
| Chain | Arc Testnet `eip155:5042002` |
| Payments | x402 / Circle Gateway · `@circle-fin/x402-batching` |
| Facilitator | `https://gateway-api-testnet.circle.com` |
| Wallets | Circle Developer-Controlled Wallets (buyer · seller · payout) |
| LLM | Google Gemini (`gemini-3.5-flash-lite`, free tier). Pluggable: the provider sits behind one interface and is chosen by an env var. |
| Runtime | TypeScript, pnpm monorepo, SQLite ledger |
| Dashboard | Next.js |

The LLM writes the reasoning attached to each offer and may choose where inside
an already-computed band to land. It cannot choose the band. The guardrail clamp
is arithmetic over each owner's own limits, runs downstream of the model, and is
re-checked by an independent guard before anything reaches the counterparty, so
changing model or provider does not change what an agent is allowed to offer.
The prompt-injection test suite is provider-agnostic and passed unmodified when
the provider was swapped.

The system also runs with `LLM_MODE=off`, using templated rationales and no API
calls at all. The safety claim does not depend on the LLM existing: with the LLM
off, every scenario reaches the same outcome, which is asserted by test.

All three scenarios have been run end to end against live Gemini. Measured
numbers, and the reason the demo runs from a recorded tape rather than live, are
in [`docs/llm-negotiation-runs.md`](docs/llm-negotiation-runs.md).

## Settlement: what is real and what is simulated

**Read this before believing any number in a screenshot.**

Settlement sits behind a `SettlementAdapter` interface with two implementations,
selected by `SETTLEMENT_MODE`:

| Mode | What happens | How you can tell |
|---|---|---|
| `local-stub` (default) | Nothing moves on chain. A deterministic reference is derived from the terms hash. | Status is `SETTLED_STUB`, `isStub` is true, the reference starts with `0xstub-`, and the CLI prints `[SIMULATED: no real money moved]`. |
| `arc-x402` | Real EIP-3009 authorisation via Circle Gateway on Arc Testnet, batch settled by Circle. **Implemented, not yet run with real money: no wallet is funded.** | Status is `PENDING` with a real transaction reference and an `arcscan` explorer link, and `isStub` is false. |

Real settlement pays the seller's 402-protected endpoint (`packages/seller-service`),
which prices each request from its own copy of the deal and refuses any request
whose terms hash does not match. `settle()` returns `PENDING` rather than
`SETTLED` on purpose: Circle batches, there is no manual flush, so an accepted
authorisation is not a confirmed on-chain transfer. See
[`docs/settlement-latency.md`](docs/settlement-latency.md).

Selecting `arc-x402` without funded wallet keys **fails at startup**. It never
downgrades quietly to the stub, because a silent downgrade is how a fabricated
transaction hash ends up in a demo.

As of the current commit, no wallet has been provisioned or funded, so every
recorded settlement is a stub. Run `pnpm --filter @parley/wallets balances` to
check funding before switching modes. Measured stub latency and the state of the
real path are recorded in [`docs/settlement-latency.md`](docs/settlement-latency.md).

**No payment occurs on any walk-away path.** That is enforced by construction
(the adapter is only reachable from the ACCEPT branch) and asserted by a
counting-spy test over scenario C.

## Dashboard

One screen: convergence chart, owner limits, settlement or walk-away, and the
full transcript.

```bash
pnpm --filter @parley/dashboard build
pnpm --filter @parley/dashboard start   # http://localhost:4020
```

Pick a scenario and it runs live, the ladder building at reading speed. The
engine and baseline agents can be swapped from the screen, which is worth doing
once: the phase 02 baseline walks into its owner's limit and gets clamped nine
times in scenario B, while the phase 04 engine never reaches its limit at all
and is clamped zero times. Same limits, two agents, and the panel counts both.

`?negotiation=<id>` replays any completed negotiation straight from the ledger
with no live process, including runs recorded from the CLI with `--db`.

The dashed lines on the chart are each side's reservation price. They reach the
browser only via the orchestrator's observer payload, computed from the phase 04
oracle; a test asserts no component sources them from a message, because a
reservation price on the bus would mean the agents could see it too.

## Status

**Work in progress.** Phases 01-07 of the implementation plan are complete:
scaffold and wallets, negotiation protocol, guardrail engine, deterministic
negotiation, bounded LLM layer, settlement and walk-away reporting, dashboard.
Submission hardening remains. See:

- [`spec.md`](spec.md): full specification
- [`plans/260726-2107-parley-implementation/plan.md`](plans/260726-2107-parley-implementation/plan.md): phased plan to 9 Aug
- [`context/latest.md`](context/latest.md): research findings with verification log

Target for final submission: **Sun 9 Aug 2026**.

## Honest limitations

- Arc **testnet** only.
- Settlement currently runs on the local stub. The Arc x402 adapter is
  implemented against a verified SDK surface, but no wallet has been funded, so
  no real settlement has been executed or measured.
- The dashboard is a local demo with no authentication. Do not expose it
  publicly with a funded wallet behind it.
- Single good per negotiation; no multi-party auctions.
- No counterparty identity or reputation system.
- Not legal contract generation; settlement binds agreed terms via a payment reference hash.
- Reputation (if built) is local and ledger-stored. **Future work:** on-chain identity and
  sybil-resistant reputation, so trust scores survive across marketplaces and can't be reset
  by spinning up a fresh seller.
