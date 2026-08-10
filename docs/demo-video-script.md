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

1. Open `https://parley-blond.vercel.app` and leave it on the hero, scrolled to
   the top. That is the opening frame. Nothing else on screen: no editor, no
   `.env` anywhere, no second browser tab.
2. Warm `/app` once in this same tab, then go back to the landing page. The
   route is `force-dynamic`, so the first visit of a cold instance can be slower
   than the rest; you do not want that on the cut at 0:32.
3. On that warm-up visit, run the preset once end to end so you know how the
   page behaves. The result renders **above** the panel, and the page **does
   move on its own**: the transcript ladder scrolls its last row into view,
   which scrolls the window with it. Rehearse letting it settle, then finding
   the chart and the walk-away panel, until it is one motion.
4. Decide the terminal question in the 1:40-2:03 beat below before you record
   anything. If you are splicing it in, capture that clip first and set it
   aside.

Recorded runs appear instantly on navigation; they are server-rendered from the
bundle, so there is no spinner to wait out. The custom run returns finished in a
single response, so it also appears at once.

---

## 0:00-0:18, the differentiator, first

Screen: the **landing page**, `parley-blond.vercel.app`, hero in view.

Open on the hero rather than `/app`. The hero already carries the headline
"Agents that negotiate the price", the sub-line with **arithmetic, not
instructions** marked, and a live transcript excerpt whose `>> CLAMP` lines show
a limit overriding an offer. That is a picture of exactly what these two beats
say. `/app` on load is a static block of explanatory text, which is the wrong
thing to be reading over. Costs zero seconds.

> Agent payments already exist. Agent pricing does not. Every agent-payment demo
> pays a price somebody else posted. Parley's two agents discover the price
> themselves: one buying bulk inference capacity, one selling, haggling inside
> hard limits their owners set in advance.

## 0:18-0:32, the mechanism

Screen: same hero. Rest the cursor near the `>> CLAMP` line in the excerpt as
you say "arithmetic disposes".

> The limits are arithmetic, not instructions in a prompt. The model proposes;
> arithmetic disposes. No prompt talks an agent past its owner's limit. That is
> a claim, so I will test it on screen.

**On the words "so I will test it on screen", click "Open the dashboard"** in
the hero button row. The cut to `/app` is then motivated by the sentence rather
than being a jump the audience has to absorb, and the navigation itself is the
transition. Do not click early; the click and the last four words land together.

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
**"Ceiling below floor: 600 against 700"**.

The page moves on its own when the result arrives: the transcript ladder calls
`scrollIntoView` on its last row, which scrolls the window. Let it settle, then
scroll **up** to the chart, and **down** once to the walk-away panel, which is
the last panel in the left column and now renders at full height with both
cards.

Two things the narration depends on, both measured rather than assumed:

- The transcript contains **one** WALK_AWAY row, the buyer at round 9. That is
  correct: the buyer declares it and the run ends, so the seller never gets
  another turn to send anything.
- The walk-away panel contains **two** post-mortems, BUYER and SELLER, because
  `recordWalkAway` writes both after the loop. Confirmed against the live API:
  `postMortems count: 2`, both `NO_ZOPA_PRICE`, final gap 629 micro-USDC each.

So "the buyer walks away, and both sides file a post-mortem" is exactly what is
on screen. Saying "both walk away" would not be.

> Those were recordings. This is not. I am setting the buyer's ceiling to six
> hundred, new numbers, not the ones you just saw, against a seller floor of
> seven hundred, derived from its cost and margin. No price satisfies both
> owners. Computed live on the server, and here it is: nine rounds, then the
> buyer walks away, and both sides file a post-mortem naming the limit that
> stopped them. Nothing agreed. Nothing paid. That is the system refusing to
> break, not me promising it will not.

This is the single most valuable twenty seconds in the video. It is a live
computation, on the public URL, from numbers the audience watched go in. Protect
it in the edit.

## 1:40-2:03, the same claim in code

Screen: second terminal.

```bash
pnpm --filter @parley/orchestrator test
```

**Recording mechanics, decide this before the take.** Xbox Game Bar captures a
single window. Alt-tabbing to a terminal mid-take does not switch the capture,
it breaks it: you get the browser frozen, or the recording stops. Three ways
out, in order of preference:

1. **Record this as a separate clip and splice it in.** Capture the terminal on
   its own, then cut it between the hero beat and the settlement beat in CapCut.
   Recommended: it costs one extra capture, keeps the browser take unbroken, and
   an edit point there reads as intentional pacing rather than a seam.
2. **Drop the beat.** It is already first in the cut order, and the hero beat
   demonstrates the same property live. Losing it costs 45 words and gains 20
   seconds of budget.
3. **Switch to OBS with display capture** instead of window capture. Correct,
   but reconfiguring and re-testing a capture tool on submission night is how
   people end up with no video at all.

Whichever you pick, do not discover this by alt-tabbing during the real take.

> And in code: a model that answers every prompt with an absurd price,
> ninety-nine million, across all three scenarios, puts zero out-of-band offers
> on the wire. Property tests, an adversarial corpus, and prompt injection
> through the counterparty's own text. One hundred forty-eight tests, all green.

148 is the whole suite, re-run 2026-08-09. This command alone runs 26.

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

## Optional: 3-second benchmark hold, only if you cut the terminal beat

The landing page benchmark table carries the one claim the video never makes:
on scenario B's identical limits, the baseline agent needed the guardrail nine
times and the engine needed it zero. That is the difference between a limit that
rescues a blunt agent and an agent that does not need rescuing, and it is
currently invisible to a viewer.

**Whether there is room depends entirely on the terminal beat:**

| | Words | At 130 wpm | Room for a 3s hold? |
|---|---|---|---|
| As written, terminal beat kept | 387 | 2:59 | **No.** Over the limit before a single pause |
| Terminal beat cut | 342 | 2:38 | **Yes**, ends about 2:41 |

So it is one or the other, not both. Given the terminal beat now also carries
the Game Bar problem, cutting it and spending three of the recovered twenty
seconds here is the better trade: the benchmark is a claim nothing else in the
video makes, while the test run repeats a property the hero beat already proved
live.

If you take it, stage it on the way back rather than as a detour. The video now
opens on the landing page, so the close returns there anyway:

1. Navigate back to the landing page.
2. Scroll to the benchmark table.
3. **Hold three seconds in silence.** Say nothing. The row pair is legible on
   its own, and narrating it would cost fifteen words you no longer have.
4. Scroll to the top of the hero and run the close below.

## 2:35-2:55, close, holding the URL

Screen: the **landing page hero**, the frame the video opened on, with the bare
`parley-blond.vercel.app` in the address bar. **Stop moving the mouse.** Hold
completely static for the full twenty seconds, and for three seconds of silence
after the last word.

Ending on the landing page rather than `/app` closes the loop the opening shot
started, and puts the root URL in the address bar rather than a sub-path, which
is the address you want a judge to type.

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

387 spoken words with the terminal beat, 342 without it.

| Reading pace | All beats (387) | Terminal beat cut (342) |
|---|---|---|
| 130 wpm, slow and deliberate | 2:59 | 2:38 |
| 140 wpm | 2:46 | 2:27 |
| 150 wpm | 2:35 | 2:17 |

**At 130 wpm the full script is 2:59, which leaves one second.** That is not a
budget, it is a coin toss: any pause for a click or a scroll puts the take over
3:00. Treat the full version as viable only at 140 wpm or faster, and treat
cutting the terminal beat as the default rather than the fallback.

If your first take runs long, it is the pauses, not the words. Use the cut order
rather than talking faster.

## Cut order if the take runs long

1. The 1:40-2:03 test beat. **Now the default cut, not the fallback**: it needs
   a separate capture because of the Game Bar window-capture problem, and the
   hero beat already demonstrates the same property live. Dropping it buys 21
   seconds, three of which buy the benchmark hold.
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
