# Gemini: verified surface and what differs from the Anthropic path

**Package:** `@google/genai@2.15.0`
**Verified:** 2026-08-03
**Method:** type definitions read from the INSTALLED package (`dist/genai.d.ts`)
plus runtime export enumeration. Model availability and rate limits read from
the live Google docs, not from memory.

Same discipline as `x402-sdk-verified-surface.md`: where this file and any blog
post disagree, this file wins.

---

## Model choice: `gemini-3.5-flash-lite`

Checked against the live pricing page rather than assumed. Reasons, in order:

1. **On the free tier.** The pricing page lists it as "Free of charge" for
   standard input and output.
2. **Stable, not preview.** Preview model IDs churn. A demo that has to be
   re-recordable next week should not depend on one. Note
   `gemini-3.1-pro-preview` is explicitly **not** free-tier.
3. **Fastest published tier.** This call picks one number inside a supplied
   range and writes one sentence. It needs speed, not reasoning depth, and
   per-call latency times 18 calls is the video's dead air.

Other free-tier options confirmed on the pricing page: `gemini-3.6-flash`,
`gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`,
`gemini-2.5-flash-lite`, `gemini-2.5-pro`.

The model name is written in exactly one place:
`DEFAULT_MODEL_BY_PROVIDER` in `packages/llm-layer/src/llm-client-factory.ts`.

## Differences from what the Anthropic path assumed

| Concern | Anthropic path | Gemini reality |
|---|---|---|
| Structured output field | `output_config.format` with `{type: "json_schema", schema}` | `responseJsonSchema` **or** `responseSchema`, and `responseMimeType` is required alongside either |
| Schema dialect | Standard JSON Schema | `responseSchema` is an **OpenAPI 3.0 subset** (Gemini's own `Schema` type); `responseJsonSchema` is standard JSON Schema. **Mutually exclusive.** |
| Per-request timeout | `{ timeout }` option on the call | **No such option.** Must be imposed externally with an `AbortSignal`. |
| Latency control | `output_config.effort: "low"` | **No effort parameter.** Equivalent is picking a `-flash-lite` model and capping `maxOutputTokens`. |
| Reading the text | `content[]` array of typed blocks | `.text` accessor on the response |
| Rate limit scope | Per API key | **Per project**, not per key. A second key in the same project shares the quota. |

### Why `responseJsonSchema`, not `responseSchema`

The brief asked for `responseSchema`. The SDK offers both, and they are
mutually exclusive:

- `responseSchema` takes Gemini's own OpenAPI-subset `Schema` type. Using it
  would mean hand-writing a **second representation** of the same schema in a
  different vocabulary, which can drift from the zod schema that validates the
  response. Two sources of truth for one contract.
- `responseJsonSchema` takes standard JSON Schema. Its documented supported
  keywords include `type`, `properties`, `additionalProperties` and `required`,
  which is exactly what our schema uses.

So the shipped code passes the **same** `OFFER_SELECTION_JSON_SCHEMA` constant
that zod-land already uses. One definition, two enforcement points, no drift.
The guarantee asked for is unchanged: the schema is enforced at generation, and
zod re-validates afterwards because model output is untrusted regardless of
what any provider promises.

The SDK's own doc comment supports this direction: *"If `response_schema`
doesn't process your schema correctly, try using `response_json_schema`
instead."*

### The timeout difference is load-bearing

The bounded selector's contract includes a hard per-call bound, and its
`TIMEOUT` branch is one of the five tested outcomes. Anthropic's SDK provided
that per call; Gemini's does not. Without the `AbortSignal` wrapper in
`gemini-llm-client.ts`, the TIMEOUT branch would be unreachable and a slow
model could stall a demo indefinitely. This is the one place where a naive port
would have silently lost a guarantee.

## Free tier rate limits

**Google no longer publishes the numbers in the docs.** The rate-limits page
now says limits "can be viewed in Google AI Studio" and links to an
authenticated page. What the official page does state:

- Free tier needs an active project or free trial, **no billing account**.
- Limits are measured on three axes: RPM, TPM (input), RPD.
- **Applied per project, not per API key.**
- Exceeding any single axis returns `429 RESOURCE_EXHAUSTED`, even if the
  others have headroom.

**RPM now CONFIRMED first-party, 2026-08-03.** A live run against this project
returned a 429 whose quota payload states the limit exactly, for the model we
actually use:

```
quotaId:      GenerateRequestsPerMinutePerProjectPerModel-FreeTier
quotaMetric:  generativelanguage.googleapis.com/generate_content_free_tier_requests
model:        gemini-3.5-flash-lite
quotaValue:   15
retryDelay:   44s
```

So **15 RPM is verified**, and it is scoped per project **per model**, which is
finer-grained than the docs state. The other two axes remain secondary and
unverified:

| Axis | Free tier (flash-lite class) | Status |
|---|---|---|
| Requests per minute | 15 | **VERIFIED** from a live 429 quota payload |
| Input tokens per minute | 250,000 | secondary, unverified |
| Requests per day | 1,000 | secondary, unverified |

**Failed requests still consume quota.** In that run, 15 requests were rejected
with 403 and the 16th was rejected with 429 for exceeding the 15 RPM limit. A
denied request is still a counted request, so a burst of failures can exhaust
the minute budget and mask the original error behind rate-limit errors.

## Blocker observed 2026-08-03: project denied access. RESOLVED same day.

**RESOLVED.** A third key, in the format `AQ.…` (53 characters) rather than the
classic `AIza…` (39 characters), works. Generation succeeds, 18 of 18 calls, and
the latency and tape artefacts were produced from it. The two earlier keys
returned `403 PERMISSION_DENIED` from projects that were blocked; a working key
was the fix, but note it took three attempts and the first two failures were
indistinguishable from each other.

Kept below because the diagnosis is the reusable part: it is how to tell a
project block from a code, model, or key-format problem without guessing.

A blocked key returns `403 PERMISSION_DENIED`, *"Your project has been denied
access. Please contact support."*, on **every** `generateContent` call.
Diagnosis, so the cause is not misattributed:

- `models.list()` **succeeds** and returns 58 models, so the key authenticates
  and the SDK wiring is correct.
- `gemini-3.5-flash-lite` **is** in that list, so the model ID is valid and
  visible to the project.
- `gemini-2.5-flash-lite` and `gemini-2.5-flash` fail identically, so it is not
  model-specific.

It is therefore a **project-level generation block on Google's side**, not a
code, model, or key-format problem. Nothing in this repo can work around it.
Resolution is a new API key on an unrestricted project, or Google support.

Consequence: live latency is still unmeasured and no tape has been recorded.
Both are one command each once generation is permitted.

### What that means for recording a tape

One scenario-A run is **18 calls** (2 agents x 9 rounds). Working from the
figures above:

- **Within a run:** 18 calls exceeds 15 RPM, so a single run spills into a
  second minute and takes roughly 60 to 75 seconds wall clock even if each
  call is fast. Latency and the rate limit are the same constraint here.
- **Recordings per day:** 1,000 RPD divided by 18 is about **55 scenario-A
  recordings**. Recording all three scenarios is 60 calls (A 18, B 24, C 18),
  so about **16 full three-scenario sessions per day**.
- **Verdict:** not a practical constraint. Sixteen full re-records a day is far
  more than a demo needs. The tape mechanism means the good run only has to
  happen once anyway.

The one caveat worth remembering: because limits are **per project**, running
the latency harness and recording a tape from two different keys in the same
project draws on the same 1,000 RPD.

## Measured latency, and the cold-start trap

Measured 2026-08-03 over 18 calls, the cost of one scenario-A run. Full report
in `docs/llm-latency.md`, regenerated by `pnpm --filter @parley/llm-layer
measure-latency`.

| Metric | Value |
|---|---|
| Mean per call | 1.07s |
| Median | 0.95s |
| p95 | 1.37s |
| Slowest | 1.53s |
| Total for a scenario-A run | 19.2s |
| Failures | 0 of 18 |

**Verdict: live calls fit a 3-minute video.** 19 seconds of a 180-second budget
is affordable. Record a tape anyway, so the recording does not depend on the API
behaving on the day.

**The cold start is the trap.** The very first call on a fresh key took
**21 seconds**, roughly 20x the steady-state figure, and it aborted a 20s probe
before the real measurement even started. Steady state settled to ~1s from the
second call onward.

That matters operationally because `LLM_TIMEOUT_MS` defaults to **4000**. The
first call of a session will exceed it, time out, and fall back to the
deterministic pick with a templated rationale. The negotiation stays correct,
but the first message loses its LLM-written sentence. Options, in order of
preference:

1. **Warm up before recording.** Make one throwaway call, then start the demo.
   Cheapest, keeps the 4s bound honest for steady state.
2. **Use `LLM_MODE=replay`** for the video, which has no cold start at all.
3. Raise `LLM_TIMEOUT_MS`, accepting a worse worst case on every call.

This is also why the latency harness now reads `LLM_TIMEOUT_MS` from config
instead of hardcoding 4000: with a fixed 4s bound it could not have measured a
provider slower than 4s, and would have reported "everything failed" rather
than "here is how slow it actually is".

## The safety claim did not move when the provider moved

Worth stating plainly, because it is the reason a provider swap is a routine
change here rather than a re-verification exercise:

The prompt-injection suite
(`packages/llm-layer/src/prompt-injection-through-negotiation.test.ts`)
**required no edits** for this swap, and passed unmodified before and after. It
names no vendor, imports no vendor SDK, and needs no API key: every test injects
a captured `LlmClient` that returns exactly what an attacker asked for.

That is possible because the guardrail clamp is arithmetic over each owner's own
limits. It consumes numbers, never model output text, and runs downstream of
whatever the model returns, with an independent egress guard re-checking before
anything reaches the counterparty. A guardrail that had to be re-tuned per
provider would not be a guardrail.

## The committed tape is NOT the demo tape

`docs/llm-tape.json` holds 18 real Gemini responses, and replay from it was
verified byte-identical to the live run, 18 of 18. That proves the record and
replay mechanism works against a real model rather than only against a stub,
which had not been shown before.

**It is not usable for the demo video yet**, and the reason is worth stating so
nobody assumes otherwise. The tape is keyed by prompt hash, and these prompts
come from the latency harness, not from a real negotiation, because the LLM
layer is not yet wired into `propose-next-offer` (phase 05 step 9). Once it is,
the engine will produce different prompts, the hashes will not match, and strict
replay will raise a tape miss.

That is the designed behaviour: a stale tape fails loudly rather than answering
a question it was never asked. **Re-record after the wiring lands**, then the
tape becomes the demo artefact.

## Unresolved

1. TPM and RPD remain secondary figures. RPM is confirmed at 15 from a live 429
   payload; confirm the other two the same way or in AI Studio.
2. The LLM layer is still not wired into `propose-next-offer`, so `LLM_MODE=full`
   does not yet affect a scenario run. The tape must be re-recorded once it is.
3. Cold-start behaviour was seen once, on a fresh key. Whether it recurs per
   session, per key, or per project is unknown; warm up before recording rather
   than relying on it not happening.
