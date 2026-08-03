# LLM latency measurement

**Regenerate with `pnpm --filter @parley/llm-layer measure-latency`.**

Mode: live (gemini / gemini-3.5-flash-lite)
Turns measured: 18 (one LLM call per agent turn; scenario A settles at round 9, so 18 calls)
Per-call timeout: 45000ms

## Results

| Metric | Value |
|---|---|
| Total wall clock | 18.1s |
| Mean per turn | 1.11s |
| Median (p50) | 1.00s |
| p95 | 1.60s |
| Slowest | 1.82s |
| Failures | 2 of 18 |

## What this means for the demo

**2 of 18 calls failed.** The figures above describe only the calls that succeeded, so treat the totals as a lower bound and re-run once the failures are resolved.

A full scenario-A negotiation costs 18s. That fits a 3-minute video, but record a tape anyway so the recording does not depend on the API behaving on the day.

## Failures

- turn 16: {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite\nPlease retry in 5.625131711s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://ai.google.dev/gemini-api/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"location":"global","model":"gemini-3.5-flash-lite"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"5s"}]}}
- turn 18: {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite\nPlease retry in 4.56465888s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://ai.google.dev/gemini-api/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"model":"gemini-3.5-flash-lite","location":"global"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"4s"}]}}

