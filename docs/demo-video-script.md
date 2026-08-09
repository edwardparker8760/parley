# Demo video script

**Target: under 3:00.** Record at 1920x1080.

**Record against the deployed URL, not localhost.** The address bar should read
`parley-blond.vercel.app` for the whole take. A judge who can see the URL can
open it, and a localhost recording is a claim they cannot check.

**Before you press record**, run `docs/pre-submit-checklist.md` section "Before
recording". One visible API key in a public video is unrecoverable.

## What the deployed instance can and cannot do

This matters, because narrating it wrong is a lie on camera.

The deploy is a **replay instance** (`PARLEY_DATA_SOURCE` unset, so
`snapshot-negotiation-source.ts` with `canRunLive: false`). Consequences:

- Scenarios A, B and C are **recorded runs**. The controls read "View scenario
  A", not "Start". A banner says so. Do not say "watch them negotiate" over
  them; say "this is a recording", which the page already says for you.
- The **"Try to break it" presets are genuinely live.** `/api/run-custom` opens
  its own in-memory database per request and is deliberately not gated on
  `canRunLive`. The run is computed on the server when you click, from the
  numbers on screen. This is the only live compute in the take, and it is the
  best thing in the video.
- A custom run is **never settled** by design. It renders "Agreed, but not
  settled." Do not promise a payment on that beat.

## Setup, done before the take

1. Open `https://parley-blond.vercel.app/app`. Nothing else on screen: no
   editor, no `.env` anywhere, no second browser tab.
2. Scroll down once to find the **"Try to break it"** section, then scroll back
   to the top. You need to know the exact scroll distance, because clicking a
   preset renders the result **above** the panel and **nothing auto-scrolls**.
   Rehearse the click-then-scroll-up move until it is one motion.
3. Have a second terminal ready, cleared, in the repo root, for the one test
   beat.

Recorded runs appear instantly on navigation; they are server-rendered from the
bundle, so there is no spinner to wait out. The custom run returns finished in a
single response, so it also appears at once.

---

## 0:00-0:18, the differentiator, first

Screen: `/app` as it loads.

> Agent payments already exist. Agent pricing does not. Every agent-payment demo
> pays a price somebody else posted. Parley's two agents discover the price
> themselves: one buying bulk inference capacity, one selling, haggling inside
> hard limits their owners set in advance.

## 0:18-0:32, the mechanism

> The limits are arithmetic, not instructions in a prompt. The model proposes;
> arithmetic disposes. No prompt talks an agent past its owner's limit. That is
> a claim, so I will test it on screen.

## 0:32-1:00, scenario B, the clamp firing

Screen: click **View scenario B**. Point at the buyer's clamp counter.

> This is a recorded run and the page says so. Blue is the buyer walking up,
> orange the seller coming down. The dashed lines are the owners' limits:
> neither agent sees the other's, you see both. They barely overlap, so the
> buyer walks into its ceiling of nine hundred. Nine times the guardrail
> overrode what the agent wanted to send. It still closed, inside both limits.

Verified against `negotiation-snapshot-b.json`: buyer ceiling 900, seller
derived floor 855, buyer `clampCount` 9, seller 0, settled at 9.00 USDC. The
counter on screen reads "guardrail overrode the strategy **9** times".

## 1:00-1:40, the hero beat: break it live

Screen: scroll to **"Try to break it"**, click
**"Ceiling below floor: 600 against 700"**, scroll straight back up.

> Those were recordings. This is not. I am setting the buyer's ceiling to six
> hundred, against a seller floor of seven hundred, derived from its cost and
> margin. No price satisfies both owners. Computed live on the server, and here
> it is: both agents work it, both walk away, and each files a post-mortem
> naming the limit that stopped it. Nothing agreed. Nothing paid. That is the
> system refusing to break, not me promising it will not.

This is the single most valuable twenty seconds in the video. It is a live
computation, on the public URL, from numbers the audience watched go in. Protect
it in the edit.

## 1:40-2:03, the same claim in code

Screen: second terminal.

```bash
pnpm --filter @parley/orchestrator test
```

> And in code: a model that answers every prompt with an absurd price,
> ninety-nine million, across all three scenarios, puts zero out-of-band offers
> on the wire. Property tests, an adversarial corpus, and prompt injection
> through the counterparty's own text. One hundred forty-six tests, all green.

146 is the whole suite, re-run 2026-08-09. This command alone runs 26.

## 2:03-2:35, settlement and the Circle stack

Screen: click **View scenario A**, point at the settlement panel and the badge.

> One real payment has run on **Arc testnet**. Nine point two three **USDC**,
> through **Circle Gateway**, over the **x402** flow its **facilitator**
> settles. Permission was granted in under one second. The money reached the
> chain about thirteen minutes later, because Circle settles in batches. Every
> recording you saw today is labelled simulated on screen. The run you watched
> me start was live, and you can type your own numbers into that same form and
> get the same thing.

Do not compress those two latencies into one number. "Permission granted in
under one second" is the authorisation (857ms). Landing on chain took 12m43s,
which "about thirteen minutes" rounds fairly. "Confirmed in one second" is false.

Two things this wording is carrying, so do not trim them casually:

1. **`x402` and `facilitator` are spoken only here.** Cut this clause and the
   video names two fewer Circle tools than the project uses, against a rubric
   that lists them.
2. **"The run you watched me start was live" is the sentence that separates
   this from a screen recording.** An earlier draft said everything but the
   payment was a recording, which was false and gave away the hero beat. The
   1:00-1:40 run is computed on the server per request by `/api/run-custom`,
   from numbers set on camera, and a viewer can reproduce it in their own
   browser. Say it, and say the invitation after it.

## 2:35-2:55, close, holding the URL

Screen: **stop moving the mouse.** Scroll to the top so the header and the
address bar are both readable. Hold completely static for the full twenty
seconds, and for three seconds of silence after the last word.

> Agents that discover the price, inside limits a human set, with the limits
> holding whatever the model says. It is live at parley dash blond dot vercel
> dot app. Set your own limits and try to break it.

Say the URL aloud and leave it legible on screen. A judge should be able to type
it without rewinding.

The close no longer claims "everything you saw runs there", because the three
scenarios are recordings and that would be the same overclaim the settlement
beat was just corrected for. It ends on the invitation instead, which is both
true and the stronger ask.

---

## Budget

378 spoken words.

| Reading pace | Spoken runtime |
|---|---|
| 130 wpm, slow and deliberate | 2:55 |
| 140 wpm | 2:42 |
| 150 wpm | 2:31 |

At 130 wpm the spoken track alone is 2:55, so the pauses for clicking and
scrolling are what push a take over 3:00. If your first take runs long, that is
the pauses, not the words. Use the cut order rather than talking faster.

## Cut order if the take runs long

1. The 1:40-2:03 test beat. Cut to the last two sentences of it, or drop it
   entirely; the hero beat already demonstrates the same property live.
2. Shorten the Circle stack list to the four names without explanation.
3. Trim the scenario B narration to the clamp counter sentence alone.

**Never cut:** the 1:00-1:40 hero beat, the SIMULATED badge sentence, or the
static URL hold. The first is the product, the second is the honesty, the third
is how anyone checks either.

## Unresolved questions

1. The 0:32-1:00 beat names scenario B's ceiling as "nine hundred" while the
   hero beat uses "six hundred". Two different numbers thirty seconds apart may
   confuse on first listen. Worth a rehearsal read to check it lands.

Video host is settled: **unlisted YouTube**.
