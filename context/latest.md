# Arc Network & x402 Feasibility Research
**For:** Pay-Per-Answer (Agentic Economy) hackathon idea
**Access date for all citations:** 2026-07-26 (publication dates given where the source states one)

---

## TL;DR - VERDICT

**BUILDABLE AS SPECIFIED.** x402 + Circle Gateway + Circle Wallets all work on Arc testnet today, using Circle's own x402 facilitator. No custom infrastructure needed, no smart contracts needed. The stack matches a backend-strong / contract-weak team almost exactly.

Circle's own worked example is *literally* a $0.001 USDC-per-call paid API on Arc Testnet, the same price point as the idea. ([Circle blog, 2026-05-18](https://www.circle.com/blog/turn-your-api-into-a-storefront-for-agents))

**Single biggest risk: differentiation, not infrastructure.** Circle ships an official starter kit ([`circlefin/arc-nanopayments`](https://github.com/circlefin/arc-nanopayments)) that already contains a LangChain buyer agent paying a paywalled seller on Arc. The naive version of this idea is a Circle demo. The *only* defensible novelty is the **multi-provider fuzzy price/quality router with a daily budget**; that must be the thesis, the demo centerpiece, and the thing the 3-min video opens with.

> ⚠️ **Correction notice:** an earlier draft of this file claimed "no x402 facilitator supports Arc" and recommended abandoning x402. That was wrong: it confused *Coinbase's* facilitator (which indeed omits Arc) with *all* facilitators. Circle operates its own. See §(b) and the Verification Log.

---

## (a) Arc network basics & testnet status

| Property | Value | Source |
|---|---|---|
| Type | EVM-compatible Layer 1, built by Circle (USDC issuer) | [Circle pressroom](https://www.circle.com/pressroom/circle-launches-arc-public-testnet) |
| Native gas token | **USDC** (no volatile gas token) | [Circle `use-arc` skill](https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-arc/SKILL.md) |
| Consensus | Malachite BFT, sub-second deterministic finality | [Arc docs](https://docs.arc.io/arc/concepts/system-overview) (UNVERIFIED-secondary, not re-fetched) |
| Validator set | Permissioned (regulated institutions), by design | [Arc blog](https://www.arc.io/) (UNVERIFIED-secondary) |
| Tooling | Foundry, Hardhat, viem, wagmi; Arc Testnet ships in viem by default | [Circle `use-arc` skill](https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-arc/SKILL.md) |

**Testnet connection details (VERIFIED)**
([Circle `use-arc` skill](https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-arc/SKILL.md), cross-checked [ChainList](https://chainlist.org/chain/5042002))

| | |
|---|---|
| Chain ID | `5042002` (hex `0x4CEF52`) |
| CAIP-2 identifier | `eip155:5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| WebSocket | `wss://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | **`https://faucet.circle.com`** → select Arc Testnet. Dispenses ~1 USDC/day; also EURC, cirBTC |

> 🚨 A previous draft of this file listed a second faucet, `arc-faucet.dev`, claiming "100 USDC instant." **I could not verify that domain from any Circle or Arc primary source. Do not use it; treat as untrusted.** `faucet.circle.com` is the only faucet confirmed by Circle.

**Docs domains:** `https://docs.arc.network` 301-redirects to `https://docs.arc.io`; both are legitimate. LLM-friendly indexes: `https://docs.arc.network/llms.txt`, `https://developers.circle.com/llms.txt`.

**Timeline / status (UNVERIFIED-secondary)**, from news aggregators, not re-confirmed first-party: public testnet launched ~2025-10-28; mainnet targeted "summer 2026", no firm date. Treat mainnet timing as unknown; **plan for testnet only.**

---

## (b) x402 on Arc - SUPPORTED ✅ (with the right facilitator)

### The key fact

**Circle operates an x402-compatible facilitator that serves Arc Testnet.**

| Item | Value | Source |
|---|---|---|
| Testnet facilitator URL | `https://gateway-api-testnet.circle.com` | [Circle blog, pub. 2026-05-18](https://www.circle.com/blog/turn-your-api-into-a-storefront-for-agents) |
| Network identifier | `eip155:5042002` (Arc Testnet) | same |
| Seller-side SDK | `@circle-fin/x402-batching/server` (Express/Next middleware) | same |
| Buyer-side SDK | `@circle-fin/x402-batching` → `GatewayClient` | [`circlefin/arc-nanopayments`](https://github.com/circlefin/arc-nanopayments) |
| Signature scheme | EIP-3009 authorizations, batched off-chain, settled on-chain in bundles | [Circle blog, pub. 2026-04-29](https://www.circle.com/blog/nanopayments-powered-by-circle-gateway-is-now-live-on-mainnet) |
| Circle's own price example | **$0.001 USDC per API call**, endpoint `POST /research/company-brief`, on Arc Testnet | [Circle blog, 2026-05-18](https://www.circle.com/blog/turn-your-api-into-a-storefront-for-agents) |

Circle's stated position: Nanopayments "works with both x402 and standard HTTP 402 flows" and "integrates with x402 as an additive payment option rather than a replacement." ([Circle, 2026-04-29](https://www.circle.com/blog/nanopayments-powered-by-circle-gateway-is-now-live-on-mainnet))

So: **x402 and Nanopayments are not competing choices.** Nanopayments is the settlement engine underneath your x402 endpoint. You get HTTP 402 semantics *and* gas-free batching.

### What is genuinely NOT supported

**Coinbase CDP's x402 facilitator does not support Arc.** Verified directly:

> Mainnet: Base (`eip155:8453`), Polygon (`eip155:137`), Arbitrum (`eip155:42161`), World (`eip155:480`), Solana.
> Testnet: Base Sepolia (`eip155:84532`), World Sepolia (`eip155:4801`), Solana Devnet.
> Source: [docs.cdp.coinbase.com/x402/network-support](https://docs.cdp.coinbase.com/x402/network-support)

Arc appears nowhere on that list. **Practical consequence: do not point your code at `https://x402.org/facilitator` or the CDP facilitator.** Point it at Circle's. That is the whole of the "gap": a config value, not a project risk.

Note that Circle's older tutorial [Build Autonomous Payments with Circle Wallets, USDC & x402](https://www.circle.com/blog/autonomous-payments-using-circle-wallets-usdc-and-x402) (pub. 2025-09-12, mod. 2026-04-10) uses **Base Sepolia and the Coinbase facilitator**; it predates Arc support. Don't follow it; follow the 2026-05-18 Arc post instead.

**Governance context (UNVERIFIED-secondary):** the x402 Foundation is reported to sit under the Linux Foundation with members including Circle, Google, Visa, AWS, Anthropic. Not re-confirmed first-party; not load-bearing for the build.

**Footnote on Arcent:** [`cutepawss/arcent`](https://github.com/cutepawss/arcent), an x402 gateway for Arc, won an honorable mention at an earlier Agentic Commerce on Arc hackathon. Historically interesting as proof x402 ran on Arc early, but **irrelevant now**; Circle's first-party SDK supersedes it. Do not fork it.

---

## (c) Circle Gateway + Wallets on Arc testnet, faucet links

### Circle Wallets - ✅ supported on Arc testnet

Circle's `use-arc` skill lists these Circle products as Arc-compatible ([source](https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-arc/SKILL.md)):

- Wallets (overview) · Modular Wallets (passkey smart accounts) · User-Controlled Wallets (social/email OTP) · **Developer-Controlled Wallets (custodial)** ← use this for the buyer agent
- Smart Contract Platform
- CCTP (cross-chain USDC)
- **Gateway** (unified USDC balance)

Because Arc is EVM-compatible, standard tooling (viem/wagmi, MetaMask) also works.

### Circle Gateway - ✅ present on Arc testnet, via Nanopayments

Gateway is the layer Nanopayments runs on ("Nanopayments powered by Circle Gateway"), and the `use-arc` skill lists `use-gateway` as an Arc product. The Arc Testnet Gateway API host is `https://gateway-api-testnet.circle.com`. ([Circle, 2026-05-18](https://www.circle.com/blog/turn-your-api-into-a-storefront-for-agents))

Money flow in Circle's reference architecture:
1. Agent Wallet holds USDC in its **Gateway Balance** → signs gasless x402 payments
2. Seller Wallet accrues revenue in its Gateway Balance after batch settlement
3. Seller withdraws on-chain USDC to a **Payout Wallet**

That three-wallet split is worth copying verbatim: it makes the demo dashboard legible to judges.

### Nanopayments status

- Minimum payment: **$0.000001**; gas cost per payment effectively zero (Circle covers settlement-layer gas). ([Circle, 2026-04-29](https://www.circle.com/blog/nanopayments-powered-by-circle-gateway-is-now-live-on-mainnet))
- **Mainnet (as of 2026-04-29): 11 chains, namely Arbitrum, Avalanche, Base, Ethereum, HyperEVM, Optimism, Polygon PoS, Sei, Sonic, Unichain, World Chain. Arc is NOT among them.** Arc is a **testnet-only** target for Nanopayments right now.
- Docs: `https://developers.circle.com/gateway/nanopayments` · x402 concepts page: [developers.circle.com/gateway/nanopayments/concepts/x402](https://developers.circle.com/gateway/nanopayments/concepts/x402)

For a testnet hackathon this is a non-issue. It does bound any "path to production" claim; see §(e).

---

## (d) Similar existing projects

### Closest match - and it's Circle's own ⚠️

**[`circlefin/arc-nanopayments`](https://github.com/circlefin/arc-nanopayments)**, the official Circle sample on Arc Testnet:
- **LangChain + Deep Agents buyer agent** autonomously purchasing access to paywalled resources
- **Next.js seller** app with a payments dashboard
- `@circle-fin/x402-batching` (`GatewayClient`), Supabase, Tailwind, shadcn/ui
- Setup: clone → `.env.local` → `npm run generate-wallets` → fund via Circle faucet → Supabase → `npm run dev` → `npm run agent`

Read this as **both a gift and a warning**: it removes ~60% of your plumbing, and it removes ~100% of your novelty if you stop where it stops. It has **one** seller. It has **no** provider choice, **no** price/quality trade-off, **no** budget. That gap is your project.

Related: [`BlockRunAI/circle-nanopayment-sample`](https://github.com/BlockRunAI/circle-nanopayment-sample), a third-party "AI agent pays for API access with gas-free USDC micropayments."

### x402 pay-per-call marketplaces elsewhere (UNVERIFIED-secondary)

The following came from an awesome-list, were **not** individually verified, and are all on Base/Solana rather than Arc. Listed for prior-art awareness only; **verify before citing in a submission**:

| Project | Claim |
|---|---|
| x402 Bazaar | ~69 API wrappers, ~$0.001/call, Base + Solana |
| LemonCake | wrap any API/MCP endpoint, set per-call price, Base |
| Superhighway | web search API, $0.001/call, Base |
| MAXIA | AI-to-AI marketplace, Solana + Base |
| MYA | agent skill discovery + paid action routing, Base |

**Takeaway:** paid-API-behind-402 is well-trodden on Base. Almost none of it is on Arc, and the *buyer-side router* is the thin part everywhere. Positioning follows: not "a marketplace", but **"the agent that decides which provider to buy from."**

### Cost/quality routing prior art (UNVERIFIED-secondary)

OpenRouter reportedly exposes a cost/quality trade-off parameter for LLM routing; academic work on utility-function routers (quality gain − cost penalty) exists but is nascent. Both unverified. Neither is a drop-in library; your routing logic is genuinely custom application code.

---

## (e) UNSUPPORTED assumptions in the idea

Going through the idea clause by clause:

| Assumption | Status |
|---|---|
| "HTTP 402 paywall in front of an AI service" | ✅ Supported: `@circle-fin/x402-batching/server` middleware |
| "0.001 USDC per call" | ✅ Supported: exactly Circle's own example figure |
| "x402 on Arc" | ✅ Supported via Circle's facilitator (**not** Coinbase's) |
| "Circle Gateway" | ✅ Supported on Arc testnet |
| "Circle Wallets" | ✅ Supported (use Developer-Controlled Wallets) |
| "Buyer agent with a daily budget, picks among 2-3 providers" | ✅ Pure application logic: nothing to support or block |
| "Suits backend-strong / contract-weak team" | ✅ Accurate: no Solidity required anywhere in this path |

**No assumption in the idea is unsupported by Arc.** The remaining flags are about scope and framing, not capability:

1. **MEDIUM: "path to production" is testnet-bounded.** Nanopayments is not on Arc mainnet (§c), and Arc mainnet has no firm date. If the judging rubric rewards "path to production," say honestly: *runs on Arc testnet today; ships to Arc mainnet when Circle enables Nanopayments there.* Don't overclaim.

2. **MEDIUM: novelty overlap with Circle's sample.** See §(d). Not a technical blocker; a submission-scoring one.

3. **LOW: batching changes payment semantics.** Payments are EIP-3009 authorizations settled in batches, not instant per-call on-chain transfers. A per-call "payment confirmed on-chain" claim in the demo would be inaccurate. Design the dashboard around *authorizations issued → batch settled*.

4. **UNVERIFIED: x402 security posture.** An earlier draft cited "ArXiv 2605.11781, five attack classes on x402." **I could not confirm that paper exists.** Generic caution stands (replay protection, short authorization expiry, nonces), but the specific citation and its five-class taxonomy are withdrawn as unverified; do not repeat them.

5. **LOW: permissioned validator set.** Arc validators are permissioned by design. No impact on the build; relevant only to decentralization claims.

---

## (f) Open questions

1. **Hackathon duration conflicts.** Some sources describe a **4-week** hackathon, an earlier draft asserted 7 weeks (July 13 → late August). Unresolved; the Encode page is JS-rendered and won't yield the schedule to a fetch. **Check the live page in a browser and pin the real dates before planning phases.**
2. **Which Encode programme?** There are at least three: `arc-hackathon` (Programmable Money, the link you gave), `arc-defi-hackathon`, `arc-bootcamp`. §(g) below assumes `arc-hackathon`.
3. **Published judging weights?** Criteria are published; numeric weights are not. Unresolved.
4. **Can 3 providers be demoed cleanly under batch settlement?** Unknown whether per-provider Gateway balances/settlement timing make a 3-provider comparison legible in a 3-minute video. Worth a spike early.
5. **Does Circle's facilitator meter or rate-limit testnet calls?** Not documented in the sources reviewed. Faucet gives ~1 USDC/day = ~1,000 calls at $0.001, which is probably fine, but confirm before designing a high-volume demo.

---

## (g) Hackathon rules & judging criteria

**Programmable Money Hackathon** (Encode Club × Arc/Circle): https://www.encodeclub.com/programmes/arc-hackathon

> ⚠️ **Sourcing caveat:** the Encode page is client-rendered; a direct fetch returns only the page title. Everything below comes from **search-engine snippets of that page**, i.e. secondary. Confirm in a browser before relying on any of it.

| Item | Value |
|---|---|
| Format | Online hackathon; build real products on Arc (USDC as gas, sub-second settlement, Circle dev platform built in) |
| Duration | **CONFLICT**: snippets say 4 weeks; an earlier draft claimed 7 weeks / July 13-late Aug. Unresolved (see §f) |
| Prize pool | **$10,000** across tracks |
| Accelerator | Top ~8 teams get places in an 8-week accelerator (weekly workshops, 1-1 calls, cohort) |
| Deadlines | Anywhere on Earth (UTC-12). Platform locks at the deadline; late submissions cannot be judged |

**Published judging criteria** (not inferred):
1. A **working prototype deployed on Arc**
2. **Clear use of Circle's developer tools**: Wallets, Contracts, CCTP, Gateway, Paymaster, Nanopayments
3. A **real use case with a path to production**
4. **Quality of execution over complexity**

**Submission requirements:**
- Functional MVP: working frontend **and** backend
- 3-minute video pitch + demo covering core functionality **and** use of Circle tools
- Link to code repository

**Read on the rubric:** criterion 2 is the highest-leverage one and this idea hits it natively: Wallets (buyer + seller + payout), Gateway (balances/settlement), Nanopayments (batching), x402. Name each explicitly in the video. Criterion 4 ("execution over complexity") argues *against* adding chains, tokens, or contracts, and *for* polishing the router demo.

---

## Recommendation

**Build x402-native on Arc testnet. One path, no hedging.**

| Layer | Choice |
|---|---|
| Payments | `@circle-fin/x402-batching`, facilitator `https://gateway-api-testnet.circle.com`, network `eip155:5042002` |
| Wallets | Circle Developer-Controlled Wallets: buyer agent wallet, per-provider seller wallets, payout wallet |
| Scaffold | Fork [`circlefin/arc-nanopayments`](https://github.com/circlefin/arc-nanopayments) for the paywall + dashboard plumbing |
| Providers | 3 sellers behind 402, deliberately differentiated: cheap/fast/mediocre · mid · expensive/slow/accurate. Different prices, real quality gaps |
| **The project** | Buyer agent: daily USDC budget + per-job-type contextual routing. Cheap-when-good-enough, expensive-when-it-matters, degrade gracefully as budget depletes |
| Demo | Dashboard: routing decisions with reasons, budget burn-down, per-provider spend/quality, batch settlement view |
| Funding | `faucet.circle.com` → Arc Testnet (~1 USDC/day; request early, it's the rate limiter) |

Explicitly dropped: forking Arcent, building a facilitator, starting on Base. All were responses to a blocker that does not exist.

**Spend the time budget roughly 20/80 between plumbing and router.** The plumbing is a solved, documented path. The router is the submission.

---

## Verification log

**Verified first-party on 2026-07-26 (fetched directly):**
- Coinbase CDP facilitator network list (Arc absent): `docs.cdp.coinbase.com/x402/network-support`
- Circle facilitator URL, `eip155:5042002`, `@circle-fin/x402-batching/server`, $0.001 example: Circle blog 2026-05-18
- Nanopayments: x402-compatible, EIP-3009, $0.000001 min, mainnet 11 chains excl. Arc: Circle blog 2026-04-29 (mod. 2026-07-10)
- `circlefin/arc-nanopayments` contents, SDK, setup steps: GitHub
- Arc chain ID / RPC / WS / explorer / faucet, Circle products on Arc: `circlefin/skills` `use-arc` SKILL.md
- `docs.arc.network` → `docs.arc.io` 301 redirect
- Circle 2025-09-12 x402 tutorial targets Base Sepolia + Coinbase facilitator (pre-Arc)

**Removed as unverified or wrong:**
- `arc-faucet.dev` "100 USDC" faucet: no primary source; treat as untrusted
- `arxiv.org/abs/2605.11781` "five attacks on x402": could not confirm the paper exists
- `x402.org/ecosystem?category=facilitators`: returns **HTTP 404**
- "x402 docs list Arc as 1 of 8 supported chains": traced to an awesome-list, not x402 docs
- The prior verdict "no facilitator supports Arc → 3-4 weeks of infra work"

**Still UNVERIFIED (marked inline above):** Arc consensus/validator/throughput details; testnet launch and mainnet dates; x402 Foundation governance; all §(d) awesome-list projects; OpenRouter and academic routing claims; every figure in §(g) (JS-rendered page, snippets only).
