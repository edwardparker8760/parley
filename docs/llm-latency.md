# LLM latency measurement

**Regenerate with `pnpm --filter @parley/llm-layer measure-latency`.**

Mode: live (gemini / gemini-3.5-flash-lite)
Turns measured: 18 (one LLM call per agent turn; scenario A settles at round 9, so 18 calls)
Per-call timeout: 45000ms

## Results

| Metric | Value |
|---|---|
| Total wall clock | 19.2s |
| Mean per turn | 1.07s |
| Median (p50) | 0.95s |
| p95 | 1.37s |
| Slowest | 1.53s |
| Failures | 0 of 18 |

## What this means for the demo

A full scenario-A negotiation costs 19s. That fits a 3-minute video, but record a tape anyway so the recording does not depend on the API behaving on the day.

