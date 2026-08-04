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

## Quickstart

Needs Node 20+ and pnpm. No API key and no wallet are required: the defaults are
`LLM_MODE=off` and `SETTLEMENT_MODE=local-stub`, and every scenario runs fully in
that configuration.

```bash
git clone https://github.com/edwardparker8760/parley.git
cd parley
pnpm install            # also builds every package
pnpm test               # 88 tests
pnpm run:scenario C     # the one that proves the guardrails bind
```

Scenario C ends with both agents walking away, both post-mortems printed, and no
payment attempted. Then, for the screen:

```bash
pnpm --filter @parley/dashboard start   # http://localhost:4020
```

Optional, and neither is needed for the demo: copy `.env.example` to `.env` and
set `LLM_API_KEY` with `LLM_MODE=full` for model-written rationales, or run
`pnpm provision-wallets` and fund the buyer to try real settlement.

## Demo scenarios

| | Setup | Outcome |
|---|---|---|
| A | Wide ZOPA | Converges by round 9, settles |
| B | Narrow ZOPA | Converges at the round cap, after real concessions |
| C | **No ZOPA** | Both walk away at round 9 and report why. No payment. |

Scenario C is the proof the guardrails bind. A fourth scenario, driven by a
conditional reputation layer, was **cut on 2026-08-03** when the schedule made it
unreachable; it survives as future work below rather than as a half-built claim.

## Circle tools used

| Tool | What it does here |
|---|---|
| **Arc Testnet** (`eip155:5042002`) | The chain settlement lands on. USDC at `0x3600...0000`, RPC `rpc.testnet.arc.network`. |
| **Circle Gateway** | `GatewayClient` holds the buyer's Gateway balance and signs the payment. Deposit, balances and withdrawal all go through it. |
| **Nanopayments / x402 batching** | `@circle-fin/x402-batching@3.2.0`. The buyer's `pay()` runs the full 402 flow; the seller's `createGatewayMiddleware` issues the 402 challenge and settles. |
| **Circle x402 facilitator** | `gateway-api-testnet.circle.com`. Verifies and settles the EIP-3009 authorisation. Passed explicitly, because the SDK's default is mainnet. |
| **Circle faucet** | Funds the buyer wallet on Arc Testnet. |

**Not used, and worth saying:** Circle Developer-Controlled Wallets. The phase 01
spike read the installed SDK rather than the blog post and found `GatewayClient`
takes a raw EVM private key via viem, with no API key and no entity secret
anywhere in the payment path. Wallets are generated locally with viem instead.
The finding is recorded in [`docs/x402-sdk-verified-surface.md`](docs/x402-sdk-verified-surface.md).

## Stack

| | |
|---|---|
| Chain | Arc Testnet `eip155:5042002` |
| Payments | x402 / Circle Gateway · `@circle-fin/x402-batching` |
| Facilitator | `https://gateway-api-testnet.circle.com` |
| Wallets | Local viem keypairs (buyer · seller · payout), funded from the Circle faucet |
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

## What is verified, and how

Claims in this README are cheap; these are the things that check them.

| Claim | What checks it |
|---|---|
| No prompt can move an owner's limit | Property tests over the band function plus an adversarial corpus, and a captured-model test where the LLM returns `99999999` on every call across all three scenarios and puts **zero** out-of-band offers on the wire |
| Neither agent can see the other's limits | A source scan asserting no agent-side file imports the ZOPA oracle, and a prompt-leak test in both directions including the seller's derived floor |
| A walk-away never pays | A counting-spy adapter over scenario C: zero settlement calls, against exactly one for scenario A |
| The transcript is not theatre | Replay from SQLite is byte-identical to the live ladder |
| `LLM_MODE=off` is a real rollback | Byte-identical ladders with the model on and off |
| A stub is never mistaken for real | `isStub` persisted on the receipt, `0xstub-` reference prefix, `SIMULATED` badge, and a factory that fails loudly rather than downgrading |

`pnpm test` runs all 88. `pnpm benchmark` regenerates the engine-versus-baseline
comparison in [`docs/engine-benchmark.md`](docs/engine-benchmark.md).

## Status

Phases 01-08 of the implementation plan are complete. See:

- [`spec.md`](spec.md): full specification
- [`plans/260726-2107-parley-implementation/plan.md`](plans/260726-2107-parley-implementation/plan.md): phased plan
- [`context/latest.md`](context/latest.md): research findings with verification log

## Honest limitations

- Arc **testnet** only. No mainnet configuration exists in this repo.
- **Settlement runs on the local stub.** The Arc x402 adapter is implemented
  against a verified SDK surface and tested offline, but no wallet has been
  funded, so no real settlement has been executed and no real latency measured.
  Every settlement figure you will see is a stub figure, and the UI says so.
- **Prompts go to a third-party API.** When `LLM_MODE` is not `off`, each agent's
  own band and offer history are sent to Google's Gemini endpoint. Fine for
  testnet demo data; it is not a production privacy posture.
- The dashboard is a local demo with **no authentication**. Do not expose it
  publicly with a funded wallet behind it.
- Single good per negotiation; no multi-party auctions.
- No counterparty identity or reputation system.
- Not legal contract generation; settlement binds agreed terms via a payment
  reference hash.
- The LLM's discretion is bounded to a 2% window around the deterministic pick.
  It colours the negotiation and writes every rationale; it does not run it.

## Future work

- **On-chain identity and sybil-resistant reputation**, so a seller's history
  survives across marketplaces and cannot be reset by spinning up a fresh
  address. This was scoped as scenario D and cut on day one of six when the
  schedule made it unreachable.
- Real settlement measured end to end, which needs a funded wallet and one
  faucet request.
- Multi-issue negotiation beyond price, quantity and two terms.
