# Checkpoint 2 Progress Summary (pasteable)

**Due:** Mon 27 Jul 2026, 18:59 GMT+7 · **Project:** Parley · **Track:** Agentic Economy

Paste the block below into the portal. Add the repo URL once pushed.

---

**Project:** Parley
**Track:** Agentic Economy
**Repository:** `<PUBLIC REPO URL>`

**Idea**

A buyer agent and a seller agent negotiate price, quantity, and terms with each other, inside
guardrails their human owners set in advance (max price, min margin, walk-away threshold). Every
offer and counteroffer is logged live with the reasoning behind it. On convergence the deal
auto-settles in USDC on Arc via x402/Gateway. On failure to converge, both agents walk away and
each reports why.

The distinction from a payments demo: Circle's nanopayments starter shows an agent paying a
*fixed* price. Parley's agents *discover* the price; settlement is the last step, not the product.

**Research completed**

- Verified Arc Testnet (`eip155:5042002`) x402 feasibility against primary sources. Confirmed
  Circle operates its own facilitator at `gateway-api-testnet.circle.com`; settlement path is
  viable with no custom on-chain contracts.
- Verified `@circle-fin/x402-batching` as the seller-middleware / buyer-client SDK, and Circle's
  three-wallet topology, from `circlefin/arc-nanopayments`.
- Corrected an earlier research error that had wrongly concluded no facilitator supports Arc.
- Faucet throughput (~1 USDC/day) identified as the real constraint on demo volume.

**Architecture (planned)**

Hybrid negotiation engine. A deterministic layer owns correctness: utility functions, concession
schedule, ZOPA detection, and a hard guardrail clamp that computes the feasible offer band; nothing
outside that band can ever be sent. An LLM layer owns judgement and legibility: it chooses where
inside the band to land and writes the one-sentence rationale attached to every offer, with
schema validation and a deterministic fallback on timeout. Owner limits are therefore enforced in
arithmetic, not in a prompt: no prompt can talk an agent past its owner's limits.

TypeScript pnpm monorepo · Circle Developer-Controlled Wallets (buyer / seller / payout) ·
SQLite transcript ledger · Next.js dashboard showing the live offer ladder, a convergence chart
with each side's private reservation price visible to the audience but not to the counterparty,
guardrail-clamp markers, and settlement state with Arc explorer links.

**Current status: work in progress**

Specification and phased implementation plan complete; no application code yet. Build begins
immediately after this checkpoint. Remaining phases: scaffold and wallet setup, negotiation
protocol, guardrail engine, deterministic negotiation logic, LLM rationale layer, settlement and
walk-away reporting, dashboard, submission package. Target for final submission: 9 August.

Three demo scenarios are planned: wide ZOPA (fast convergence and settlement), narrow ZOPA
(late convergence after real concessions), and no ZOPA (both walk away, no payment); the last
being the proof that the guardrails genuinely bind.

---

## Submission checklist

- [ ] Git installed
- [ ] `git init`, initial commit
- [ ] Public repo created and pushed
- [ ] Repo URL pasted above
- [ ] Track selected: **Agentic Economy**
- [ ] Submitted before Mon 27 Jul 18:59 GMT+7
