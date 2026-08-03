# Settlement latency

**Measured:** 2026-08-03, phase 06.
**Purpose:** the phase 08 video script needs a real number, not an assumption.

## Stub path (`SETTLEMENT_MODE=local-stub`), MEASURED

| | |
|---|---|
| Scenario | A (wide ZOPA), engine strategy |
| ACCEPT to receipt resolved | **815 ms** |
| Of which artificial delay | 800 ms (`SETTLEMENT_STUB_LATENCY_MS`) |
| Real work | ~15 ms (terms hash, two SQLite writes) |
| Receipt status | `SETTLED_STUB`, `isStub: true`, reference `0xstub-...` |

The 800 ms is deliberate: it makes the PENDING to SETTLED transition visible on
screen rather than instantaneous. It can be set to 0 for tests.

## Real path (`SETTLEMENT_MODE=arc-x402`), NOT MEASURED

**Blocked, and honestly so.** No wallet is provisioned: `BUYER_PRIVATE_KEY`,
`SELLER_WALLET_ADDRESS` and their siblings are still the `.env.example`
placeholders, so there is no key to sign with and no address to fund. The
credential gate at phase 06 step 8 therefore closed with the outcome
**COMPLETE-ON-STUB**.

What is already known about the real path, from the phase 01 spike
(`docs/x402-sdk-verified-surface.md`):

- Settlement is a five-state lifecycle Circle owns: `received` to `batched` to
  `confirmed` to `completed`, or `failed`.
- **There is no manual flush.** Batch timing cannot be forced from our side, so
  the latency is Circle's to determine and ours only to measure.
- Status is readable via `getTransferById(id)`, so the figure below can be
  measured properly once a wallet exists.

**To unblock:** run `pnpm provision-wallets`, fund the buyer address at
`https://faucet.circle.com` (Arc Testnet, roughly 20 USDC per request every
2 hours), confirm with `pnpm --filter @parley/wallets balances`, then implement
the adapter against the verified surface and re-measure ACCEPT to `completed`.

**Consequence for the video:** the demo settles on the stub and says so on
screen. The `SIMULATED` badge and the `0xstub-` reference prefix are the
integrity controls that make that honest rather than misleading.
