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

## Real path (`SETTLEMENT_MODE=arc-x402`), CODE COMPLETE, NOT YET MEASURED

**Status changed 2026-08-04.** The path is now built end to end and tested
offline. What is missing is money, not code.

Built:

- `packages/seller-service`: the 402-protected endpoint the buyer pays. Prices
  each request from the seller's own copy of the deal row, and refuses any
  request whose terms hash does not match, before quoting a price.
- `ArcX402SettlementAdapter`: `supports()` precondition, `pay()` through the
  full 402 flow, amount cross-check against the deal, `waitForSettlement()`
  polling `searchTransfers`.
- `pnpm --filter @parley/settlement deposit`: moves faucet USDC from the wallet
  into the Gateway balance, which is the step that is easy to miss.
- 12 tests over the adapter and the paywall, all offline. The 402 challenge is
  exercised against Circle's real testnet facilitator and comes back in ~2s.

Not done, and it needs a human at a browser:

1. Fund the buyer address `0x38D6faC8493cd60C120fa0629A19713606d64F38` at
   `https://faucet.circle.com` (Arc Testnet, roughly 20 USDC per request every
   2 hours). **Native gas is needed too**, because the deposit is two on-chain
   transactions.
2. `pnpm --filter @parley/settlement deposit 5`
3. `pnpm --filter @parley/seller-service start --db parley-ledger.db`
4. `SETTLEMENT_MODE=arc-x402 pnpm --filter @parley/orchestrator scenario A --db parley-ledger.db`
5. Record ACCEPT to `completed` here, and the explorer URL.

## What is already known about the real path

From the phase 01 spike (`docs/x402-sdk-verified-surface.md`), re-confirmed
against the installed package on 2026-08-04:

- Settlement is a five-state lifecycle Circle owns: `received` to `batched` to
  `confirmed` to `completed`, or `failed`.
- **There is no manual flush.** Batch timing cannot be forced from our side, so
  the latency is Circle's to determine and ours only to measure.
- Status is readable via `getTransferById(id)` and `searchTransfers(params)`.

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

Until step 5 above runs, **every settlement figure in this repo is a stub
figure**, and the video must say so.

## Unresolved questions

1. Does the Arc faucet dispense native gas alongside USDC? If not, gas has to
   come from somewhere else before `deposit()` can run.
2. Batch latency is unknown until measured. If it exceeds the video's patience,
   the demo shows the authorisation landing and the settlement confirming later,
   which is the honest framing anyway.
