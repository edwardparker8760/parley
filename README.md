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
calls at all. The safety claim does not depend on the LLM existing.

## Status

**Work in progress: Checkpoint 2 (mid-submission).** Research and specification complete,
implementation plan locked, build starting. See:

- [`spec.md`](spec.md): full specification
- [`plans/260726-2107-parley-implementation/plan.md`](plans/260726-2107-parley-implementation/plan.md): phased plan to 9 Aug
- [`context/latest.md`](context/latest.md): research findings with verification log

No application code yet. Target for final submission: **Sun 9 Aug 2026**.

## Honest limitations

- Arc **testnet** only; faucet-limited throughput (~1 USDC/day).
- Single good per negotiation; no multi-party auctions.
- No counterparty identity or reputation system.
- Not legal contract generation; settlement binds agreed terms via a payment reference hash.
- Reputation (if built) is local and ledger-stored. **Future work:** on-chain identity and
  sybil-resistant reputation, so trust scores survive across marketplaces and can't be reset
  by spinning up a fresh seller.
