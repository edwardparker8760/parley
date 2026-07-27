# Phase 02: Seller Services Behind x402

**Context:** [plan.md](plan.md) · [phase-01](phase-01-scaffold-wallets-sdk-spike.md)
**Priority:** P0 (the router needs something to route between)
**Status:** ☐ Not started
**Days:** Jul 27-28

## Overview

Three independent paywalled answer providers with **genuinely different price/quality/latency
profiles**, each settling to its own wallet. Decision locked: 2 real + 1 deliberately degraded.

## Key insights

- Differentiated *prices* are what give the router a real axis to optimise. Uniform pricing
  would make the whole submission a no-op.
- The degraded provider is not a cheat; it exists so fallback is demoable **on cue** in a
  3-minute video, instead of hoping a real provider fails on camera. Label it honestly in the UI.

## Requirements

**Functional**
- `swift`: real, cheap/fast tier, **$0.001**/call.
- `deep`: real, premium tier, **$0.005**/call.
- `frugal`: cheapest at **$0.0005**/call, with an admin-toggleable degradation mode
  (injected latency, truncated context, forced error rate).
- Each returns `{ answer, providerId, latencyMs, tokensUsed }` and settles to its own wallet.

**Non-functional**
- Identical HTTP contract across all three; the router must not special-case any provider.
- Degradation is config-driven at runtime, not a code branch per provider.

## Architecture

```
apps/sellers/
├── src/
│   ├── server.ts                       # one binary, PROVIDER_ID selects config
│   ├── provider-configs.ts             # price, model, tier, degradation profile
│   ├── answer-handler.ts               # calls the underlying model
│   └── degradation-middleware.ts       # latency / truncation / error injection
```

One binary, three configs, three ports. Avoids triplicated code (DRY) and guarantees an
identical contract.

## Related code files

**Create:** `apps/sellers/src/*` (above), `apps/sellers/.env.example`
**Modify:** `packages/shared/src/types.ts` (add `AnswerRequest`, `AnswerResponse`, `ProviderId`)
**Delete:** `apps/spike/`

## Implementation steps

1. Define `AnswerRequest`/`AnswerResponse` in `shared`; this is the contract both sides compile against.
2. `server.ts`: read `PROVIDER_ID`, load config, mount `@circle-fin/x402-batching/server`
   middleware at that provider's price and seller wallet (use the verified phase-01 API).
3. `answer-handler.ts`: call the tier's real model; return answer + measured latency + tokens.
4. `degradation-middleware.ts`: given a profile, optionally sleep N ms, truncate the prompt
   context, or throw with probability p. No-op when the profile is off.
5. Admin route `POST /admin/degrade { enabled, profile }`; this is how the demo triggers fallback live.
6. Run all three concurrently; confirm three distinct 402 prices and three distinct wallets.

## Todo

- [ ] Shared request/response contract defined
- [ ] Single seller binary + 3 provider configs
- [ ] x402 middleware per provider at its own price and wallet
- [ ] Real model calls wired for `swift` and `deep`
- [ ] Degradation middleware + admin toggle
- [ ] 3 sellers running, 3 prices, 3 wallets verified on testnet
- [ ] `apps/spike/` deleted

## Success criteria

Three concurrent sellers, each returning a correct 402 quote at its own price, each paid
answer settling to a distinct wallet. Fallback triggerable on demand via the admin route.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Judges read `frugal` as fake | Label it explicitly as a fault-injection provider in the UI and pitch. Honesty beats a hidden fudge. |
| Real API keys / spend not approved | **Confirm with the user before this phase.** Fallback: make `deep` a real premium model and `swift` a cheaper real model on the same key. |
| Prices too close to differentiate | 10× spread ($0.0005 → $0.005) is deliberate. Do not narrow it. |

## Security

- Model API keys server-side only, never reachable from the buyer or dashboard.
- Admin degradation route bound to localhost or shared-secret guarded; it is a live kill switch.

## Next steps

Phase 03 builds the buyer that pays these three.

## Unresolved

- Does the user have API keys and spend approval for two real providers? **Blocks step 3.**
