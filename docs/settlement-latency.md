# Settlement latency

**Purpose:** the phase 08 video script needs a real number, not an assumption.

## Stub path (`SETTLEMENT_MODE=local-stub`), MEASURED 2026-08-03

| | |
|---|---|
| Scenario | A (wide ZOPA), engine strategy |
| ACCEPT to receipt resolved | **815 ms** |
| Of which artificial delay | 800 ms (`SETTLEMENT_STUB_LATENCY_MS`) |
| Real work | ~15 ms (terms hash, two SQLite writes) |
| Receipt status | `SETTLED_STUB`, `isStub: true`, reference `0xstub-...` |

The 800 ms is deliberate: it makes the PENDING to SETTLED transition visible on
screen rather than instantaneous. It can be set to 0 for tests.

## Real path (`SETTLEMENT_MODE=arc-x402`), MEASURED 2026-08-06

**Status changed 2026-08-07.** The path is built end to end, tested offline, and
has now carried one real payment from authorisation through to an on-chain
transaction hash. See "The real run" below for the numbers.

Built:

- `packages/seller-service`: the 402-protected endpoint the buyer pays. Prices
  each request from the seller's own copy of the deal row, and refuses any
  request whose terms hash does not match, before quoting a price.
- `ArcX402SettlementAdapter`: quote precondition, `pay()` through the full 402
  flow, amount cross-check against the deal, `waitForSettlement()` polling
  `getTransferById` until the batch lands and the real hash appears.
- `pnpm --filter @parley/settlement deposit`: moves faucet USDC from the wallet
  into the Gateway balance, which is the step that is easy to miss.
- `pnpm --filter @parley/settlement transfer-status <id>`: asks Circle what
  became of a transfer, later. The run that pays cannot report the hash.
- 14 tests over the adapter and the paywall, all offline. The 402 challenge is
  exercised against Circle's real testnet facilitator and comes back in ~2s.

## The real run, 2026-08-06

Executed. The steps below are the ones that were actually run, in order.

1. Funded `0x38D6faC8493cd60C120fa0629A19713606d64F38` at
   `https://faucet.circle.com` (Arc Testnet). **One request, 20 USDC.**
2. `pnpm --filter @parley/settlement deposit 12`
3. `pnpm --filter @parley/seller-service start --db ../../parley-real-settlement.db --port 4021`
4. `SETTLEMENT_MODE=arc-x402 SELLER_SERVICE_URL=http://127.0.0.1:4021 pnpm run:scenario A --db ../../parley-real-settlement.db`

Measured:

| | |
|---|---|
| negotiation | `a-negotiation-2`, settled round 8, 0 clamps |
| amount | 9.23 USDC (10,000 calls at 923 micro-USDC) |
| terms hash | `0xa02068cbbe1cca39c75c92306068ed60ee7acaac5dc7f0b7aef40299a2f240af` |
| Circle transfer id | `cad9fe1e-7201-40d0-b4d9-ce6a7c3655d4` |
| receipt status | `PENDING` (authorisation accepted) |
| **authorisation latency** | **857 ms** |
| Gateway balance | 12,000,000 to 2,770,000 atomic units, a fall of exactly 9,230,000 |
| **batch latency** | **12 min 43 s** (created 07:58:22Z, completed 08:11:05Z) |
| final status | `completed` |
| **batch tx hash** | `0xcccd6d68ed7395faf486bac891df2bf135bdd6c71fdda012009667170f5be6aa` |
| explorer | `https://testnet.arcscan.app/tx/0xcccd6d68...f5be6aa` |

So the money left the buyer's Gateway balance, Circle held a transfer from
buyer to seller for the exact agreed amount, and the batch then landed on chain.
Both halves are now measured: **857 ms to authorise, 12 min 43 s to settle.**

## What that hash is, and what it is not

Checked against Arc Testnet on 2026-08-10, because the row above was being read
as "the transaction that shows our payment". It is not that.

| | |
|---|---|
| `0xcccd6d68` decodes to | `submitBatch`, status success, block 55578053 |
| sent from | `0xc73eF0D8...`, a Circle address, not the buyer |
| sent to | `0x0077777d...`, the Gateway contract |
| token transfers decoded | **0** |
| mentions 9.23, the buyer or the seller | **no** |
| seller `0x4Fc4cec3...` on-chain token transfers, all time | **0** |
| buyer `0x38D6faC8...` on-chain token transfers, all time | 2: faucet 20.00 in, Gateway deposit 12.00 out. Neither is 9.23 |

It is the batch our authorisation was settled in, which is a real and useful
fact, but it is not evidence of this deal on its own. The evidence for the
payment is the Gateway balance falling by exactly 9,230,000 atomic units and the
Circle transfer record, which is retrieved with `transfer-status`.

The one on-chain transaction that genuinely belongs to this story is the
**deposit**: `0x04dc69c755c4d2601e28fe2c7dc42e6eaa8a60a5949809eac182a4336e3376d2`,
12.00 USDC from the buyer into Gateway at 07:52, which funded the payment.

Anywhere this project describes the payment, it must say the payment moved
inside Gateway's balance system and point at those two transactions for what
they actually are. Linking the batch as though it showed the transfer sends a
judge to a page that contradicts us.

The two numbers are separate on purpose and must stay separate when described.
The demo sees the first one; the second happens long after the run has exited.
"Payment authorised in 857 ms, batch settled on chain 12 minutes later" is the
truthful sentence. "Payment confirmed in 857 ms" would not be.

Confirmed with `pnpm --filter @parley/settlement transfer-status <id>`, which
exists for exactly this: the run that pays cannot be the run that reports the
hash.

Gas, measured, all paid by the buyer and all in USDC (Arc's gas token is USDC
itself, see the note below):

| step | cost |
|---|---|
| ERC-20 approve | 0.001120 |
| Gateway deposit | 0.001768 |
| total | **0.002888 USDC** |

The pre-run estimate was 0.004242, so the estimate was right to within a factor
of 1.5 and in the safe direction.

### Three bugs this run found

1. `deposit-to-gateway-script.ts` called `JSON.stringify` on a result
   containing bigints, which throws. It threw AFTER the deposit had landed, so
   a successful 12 USDC deposit was reported as `deposit failed`. Fixed with a
   bigint-aware replacer. This is the most expensive shape of bug: the
   operator's next move is to retry a transfer they have already paid for.

2. The adapter recorded Circle's transfer id as the receipt's `txHash`, and
   `finalise-negotiation-outcome.ts` built an explorer URL from it. That
   produced `https://testnet.arcscan.app/tx/<uuid>`, which arcscan answers
   `200` for because it is a single page app, so the link looked like proof of
   an on-chain transaction and was not one. `txHash` is now null until a real
   hash exists.

3. `waitForSettlement` could never observe anything. It called
   `searchTransfers({ from, network })` and read `page.data[0]`, but the SDK
   answers `{ transfers: [...] }`, so that index was always `undefined` and the
   method could only run out its timeout and report `unknown`. The bug was
   invisible because its failure mode is indistinguishable from a slow batch.
   Worse, the response came back carrying transfers between addresses unrelated
   to ours, so `from` is not filtering, and "newest transfer from this address"
   would have been unsafe even with the shape corrected. It now polls
   `getTransferById` with the id `settle` already returned, and returns the
   `txHash` it observes. That is what produced the 12 min 43 s figure above.

### The `supports()` precondition did not work, and why

The adapter used to gate on `GatewayClient.supports(url)`. That probes the paid
route with no body; the seller answers `409` to any request without a matching
terms hash, before it will quote a price. So the probe reported a perfectly
functional seller as not offering Gateway batching, and the first real run
failed at the precondition rather than at anything real.

Measured on the live service: bare probe `409`, probe carrying the correct
terms hash `402` with payment requirements. The seller was right and the
precondition was wrong. Weakening the seller to satisfy the probe would have
removed the property that binds a payment to the negotiation that produced it,
so the precondition moved to the seller's unpriced `quote` route instead, which
also catches a price disagreement before a signature rather than after.

## What is already known about the real path

From the phase 01 spike (`docs/x402-sdk-verified-surface.md`), re-confirmed
against the installed package on 2026-08-04:

- Settlement is a five-state lifecycle Circle owns: `received` to `batched` to
  `confirmed` to `completed`, or `failed`.
- **There is no manual flush.** Batch timing cannot be forced from our side, so
  the latency is Circle's to determine and ours only to measure.
- Status is readable via `getTransferById(id)`. `searchTransfers(params)` also
  exists but is not used here: measured on 2026-08-07 it returns
  `{ transfers: [...] }` rather than the `{ data: [...] }` the types suggest,
  and it ignored the `from` filter, returning unrelated addresses' transfers.
  `getTransferById` needs neither a shape guess nor a filter to be honoured.

**Consequence, and it is deliberate in the code:** `settle()` returns `PENDING`,
never `SETTLED`. An authorisation has been signed and accepted; the batch has
not necessarily landed. Reporting `SETTLED` at that moment would be a claim
about Circle's schedule that this code is in no position to make. The correct
vocabulary is "authorisation issued, then batch settled".

## Honesty controls that survive this change

The stub is still the default, and it still announces itself: status
`SETTLED_STUB`, `isStub` persisted, reference prefixed `0xstub-`, and the CLI
prints `[SIMULATED: no real money moved]`. Selecting `arc-x402` without keys
fails at startup rather than downgrading. A failure in the real adapter throws
and marks the receipt `FAILED`; it never falls back to the stub.

One real settlement has now run and completed on chain (above). **Every OTHER
settlement figure in this repo is still a stub figure**, including all three
bundled dashboard recordings, and the UI labels them `SIMULATED`. The video
must keep saying so for those, and must keep the real one's two latencies
distinct: authorised in 857 ms, settled on chain 12 min 43 s later.

## Unresolved questions

1. ~~Does the Arc faucet dispense native gas alongside USDC?~~ **Resolved
   2026-08-06, and the question was malformed.** There is no separate gas
   asset. On Arc, USDC *is* the native gas token, and the chain reports one
   balance two ways: `eth_getBalance` returned `20000000000000000000` (18
   decimals) while `balanceOf` on the USDC contract returned `20000000` (6
   decimals) for the same address. The ratio is exactly 1e12. One faucet
   request of 20 USDC funds both views, because they are one balance.
2. ~~Batch latency is unknown until measured.~~ **Resolved 2026-08-07:
   12 min 43 s** for the one transfer measured. That is far past the video's
   patience, so the demo does what was planned anyway: it shows the
   authorisation landing at 857 ms, and the on-chain confirmation is reported
   afterwards via `transfer-status`. One sample is not a distribution, and
   nothing here should be described as a typical batch time.
