# Parley Specification

**Hackathon:** Encode Club × Arc Programmable Money (`arc-hackathon`)
**Track:** Agentic Economy
**Network:** Arc Testnet `eip155:5042002` · facilitator `https://gateway-api-testnet.circle.com`
**Final submission:** Sun 9 Aug 2026 (AoE) · Demo Day Thu 20 Aug

---

## 1. What it is

Two autonomous agents, a **buyer** and a **seller**, negotiate price, quantity, and terms
with each other, inside guardrails their human owners set in advance. Every offer and
counteroffer is logged live with the reasoning behind it. When they converge, the deal
**auto-settles in USDC on Arc** via x402/Gateway. When they don't, both walk away and each
reports exactly why.

The pitch in one line: *machine-speed haggling with human-set limits and instant settlement.*

## 2. Why it's not a demo of someone else's sample

Circle's `arc-nanopayments` starter shows an agent **paying a fixed price**. Parley's agents
**discover the price**. Payment is the last step, not the product. The negotiation engine,
and the guarantee that an LLM can never talk an agent past its owner's limits, is the work.

## 3. Owner guardrails (the safety story)

Guardrails are set by the human owner before the negotiation opens, and are **hard clamps
enforced in deterministic code**. The LLM proposes; arithmetic disposes. No prompt can move
an agent past its own limits. This is the property judges should leave remembering.

**Buyer owner sets:** max unit price · max total spend · required quantity (min/target) ·
walk-away threshold (max rounds, or minimum acceptable utility)

**Seller owner sets:** cost basis · min margin % · min unit price (derived) · available
quantity · walk-away threshold

Each side's guardrails are **private to that side**. Neither agent sees the other's reservation
values, the same asymmetry a real negotiation has.

## 4. Negotiation protocol

Structured message envelope, alternating turns, hard round cap.

| Message | Payload |
|---|---|
| `OFFER` | unitPrice, quantity, terms (delivery window, payment terms), rationale |
| `COUNTEROFFER` | same shape, from the other side |
| `ACCEPT` | references the offer being accepted |
| `WALK_AWAY` | reason code + human-readable explanation |

Every message is persisted with the deterministic state that produced it; the offer ladder is
the primary artefact of the whole project.

## 5. Negotiation engine (hybrid, carried over from the locked decision)

**Deterministic layer** owns correctness:
- Utility function per side over (price, quantity, terms)
- Guardrail clamp: computes the feasible offer band for this round. **Nothing outside it ships.**
- Concession schedule: how much to move this round, given rounds remaining and the gap
- ZOPA detection: if the two reservation prices cannot overlap, converge is impossible;
  detect and walk away early rather than burning rounds

**LLM layer** owns judgement and legibility:
- Chooses where inside the feasible band to land, and how to frame the terms
- Writes the one-sentence rationale attached to every offer
- Bounded exactly as the router's LLM was: output validated, out-of-band proposals rejected and
  replaced by the deterministic pick, hard timeout → deterministic fallback

## 6. Settlement

On `ACCEPT`: buyer settles `unitPrice × quantity` in USDC on Arc via x402/Gateway. Deal terms
are hashed into the payment reference so the settlement is bound to the agreed terms. Dashboard
shows pending → settled with tx hashes to the Arc explorer.

On `WALK_AWAY`: no payment. Both sides emit a structured post-mortem: which guardrail bound,
the final gap, and whether a ZOPA existed at all.

## 7. Dashboard

One screen:
- **Live transcript**: offer/counteroffer ladder with each side's rationale
- **Convergence chart**: the two price lines closing (or failing to), with each side's private
  reservation price shown *to the audience but never to the counterparty*. This is the visual
  that makes the whole idea legible in ten seconds.
- **Guardrail panel**: both owners' limits, and a marker each time a clamp bit
- **Settlement panel**: pending vs settled, tx hashes
- **Scenario controls**: launch scenario A/B/C (below) on demand

## 8. Demo scenarios

| | Setup | Expected outcome |
|---|---|---|
| A | Wide ZOPA | Converges and settles, with a legible concession ladder |
| B | Narrow ZOPA | Converges late, after real concessions; shows the engine earning its keep |
| C | No ZOPA | Both walk away, each reports why. **No payment.** |
| D *(stretch, §13)* | Repeat negotiation vs a seller with bad review history | Buyer opens tougher, walks earlier; visible strategy shift on the dashboard |

Scenario C is the one that proves the guardrails are real. Scenario D exists only if the
conditional reputation layer (§13) is built.

**Scenario A has no round-count target. DECIDED 2026-08-03, from measurement.**
An earlier draft of the phase-04 plan required A to settle "within 6 rounds". That
criterion is dropped, and no replacement round target is set, for three reasons:

1. **Round count is not tunable via the concession curve.** Sweeping the
   back-loading exponent from 0.8 to 2.5 produced settlement at rounds 9 to 11
   across the entire range. The curve shape does not move the number materially.
2. **The binding constraint is the acceptance rule**, not the schedule. The only
   way to reach 6 rounds is to make agents accept offers further from what they
   could still reach.
3. **That trade directly damages the demo.** A shorter ladder is a less legible
   ladder, and watching the agents haggle is the entire differentiator. Buying
   three rounds would cost the thing the criterion existed to protect.

What is measured instead: the engine must beat the fixed-concession baseline on
rounds **and** on price quality (distance from the true ZOPA midpoint), while the
transcript still shows a readable concession ladder. Both numbers are reported in
`docs/engine-benchmark.md`, regenerated by `pnpm benchmark`.

## 9. What is being traded

**CONFIRMED 2026-07-26.** **Bulk inference capacity.** The buyer agent needs N model calls; the
seller sells capacity at a unit price. Negotiable non-price terms: **delivery window** and **SLA**.
Chosen because quantity and unit price are genuinely real, it settles naturally per-unit over
x402, and it reuses the nanopayments starter's shape.

Utility inputs follow directly: buyer maximises (calls secured, SLA tier) against (unit price,
total spend); seller maximises (margin per call, capacity utilised) against (delivery window
tightness, SLA commitment cost).

## 10. Carried over from the prior direction

x402/Gateway plumbing · Circle Developer-Controlled Wallets · budget guard (now the buyer's
max-total-spend clamp) · decision-reasoning log (now the offer rationale log) · batch settlement
view · SQLite ledger.

**Dropped:** multi-provider routing, provider quality EWMA, the 2-real-1-degraded provider split.
Superseded by the negotiation engine.

**Revived (conditionally):** the trust-score concept from the superseded Pay-Per-Answer plan
returns as the §13 reputation layer: per-seller review history informing buyer strategy.

## 11. Out of scope

Multi-party auctions · mainnet · **on-chain identity / sybil resistance** (one "future work"
line in README only) · legal contract generation · more than one good per negotiation.

(Local, ledger-stored reputation is conditionally IN scope; see §13.)

## 12. Open questions

1. ~~§9 traded good~~ **RESOLVED 2026-07-26**: bulk inference capacity.
2. Do both agents run in one process (simpler, easier to demo) or as two services over HTTP
   (more credible as independent parties)? Leaning two services; costs ~half a day.
3. Judging weights unpublished; assume equal.
4. Does `@circle-fin/x402-batching` expose settlement status / manual flush? Unknown until the
   phase-01 SDK spike.

## 13. Stretch goal (CONDITIONAL): Reputation layer

**Gate: may only start if phases 01-07 are complete and on schedule. If the schedule slips,
this is cut FIRST, before dashboard polish. Core negotiation + settlement always wins.**

- **Review after every deal**: settled or walked, the buyer agent writes a structured review
  of the seller: score 1-5 + one-line LLM comment, stored in the existing SQLite ledger.
- **Reputation-aware strategy**: before a new negotiation, the buyer reads the seller's past
  reviews and adjusts strategy and guardrails: lower trust → tougher opening offer, earlier
  walk-away threshold. The adjustment is deterministic (trust score scales concession schedule
  and round cap); the LLM comment is colour, not control.
- **Demo scenario D**: repeat negotiation against a seller with a bad review history; the
  dashboard shows the strategy shift side-by-side with the clean-history baseline.
- Reputation is **local and ledger-stored**. On-chain identity / sybil resistance stays out of
  scope (§11); README carries one "future work" line instead.
