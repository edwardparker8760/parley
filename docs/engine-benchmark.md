# Engine versus baseline benchmark

**Regenerate with `pnpm benchmark`.** Do not edit by hand.

The baseline is the phase 02 fixed-concession strategy: move 20% of the
gap each round, accept when the counterparty's offer is at least as good
as your own next one. The engine adds utility functions, a back-loaded
concession schedule with anti-inference defences, ZOPA inference from
revealed offers, and a terms-for-price trade.

## Why two numbers

Rounds alone is a misleading target. A negotiation that closes in two
rounds shows no concession ladder, and being able to watch the agents
haggle is the entire point of the project. So price quality is reported
alongside: distance from the true ZOPA midpoint, where the midpoint is the
neutral split. A deal at one party's own limit means the other captured
essentially all the surplus, which is a worse result than a deal near the
middle even though both are legal.

## Results

| Scenario | Strategy | Outcome | Round | Messages | Settled price | Distance from ZOPA midpoint | Clamps | Correct |
|---|---|---|---|---|---|---|---|---|
| A | baseline | SETTLED | 10 | 20 | 1045 (0.001045 USDC) | 67 | 0 | yes |
| A | engine | SETTLED | 9 | 18 | 982 (0.000982 USDC) | 4 | 0 | yes |
| B | baseline | SETTLED | 12 | 24 | 900 (0.0009 USDC) | 23 | 9 | yes |
| B | engine | SETTLED | 12 | 24 | 856 (0.000856 USDC) | 21 | 0 | yes |
| C | baseline | WALKED_AWAY | 12 | 25 | n/a | n/a | 18 | yes |
| C | engine | WALKED_AWAY | 9 | 17 | n/a | n/a | 0 | yes |

## Scenario by scenario

### Scenario A: Wide ZOPA

Expected: Converges and settles

- Rounds: engine is 1 round faster.
- Price quality: engine settles 63 micro-USDC closer to the fair midpoint.
- Outcome correctness: baseline correct, engine correct.

### Scenario B: Narrow ZOPA

Expected: Converges late, after real concessions

- Rounds: same number of rounds.
- Price quality: engine settles 2 micro-USDC closer to the fair midpoint.
- Outcome correctness: baseline correct, engine correct.

### Scenario C: No ZOPA

Expected: Both walk away, no payment

- Rounds: engine is 3 rounds faster.
- Price quality: no settled price to compare.
- Outcome correctness: baseline correct, engine correct.

