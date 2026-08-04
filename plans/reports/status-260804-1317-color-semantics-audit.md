# Colour semantics audit, before the re-skin

**Date:** 2026-08-04 · **Scope:** gate for the design re-skin. No component changed yet.

## 1. What colour currently means in the dashboard

Five hues carry meaning today. Several are overloaded across unrelated states.

| Token | Hex | Every meaning it currently carries |
|---|---|---|
| `--danger` | `#f85149` | clamp fired (transcript badge) · WALKED_AWAY outcome · FAILED receipt · "no overlap exists" · post-mortem reason code · verdict "impossible" |
| `--ok` | `#3fb950` | SETTLED and SETTLED_STUB · ZOPA band fill and stroke · seller derived floor |
| `--warn` | `#d29922` | PENDING receipt · RUNNING outcome · SIMULATED badge · LLM out-of-band badge · verdict "possible" · "negotiating..." |
| `--buyer` | `#58a6ff` | buyer party: chart line, dots, reservation line, row tint, column heading |
| `--seller` | `#f0883e` | seller party: same set |

Underlying state values that reach the UI: `SETTLED`, `SETTLED_STUB`, `PENDING`,
`FAILED`, `NOT_ATTEMPTED`, `WALKED_AWAY`, `RUNNING`, and the six LLM outcomes
`ACCEPTED`, `OUT_OF_BAND`, `SCHEMA_INVALID`, `TIMEOUT`, `ERROR`, `LLM_OFF`.

## 2. Finding: the current palette already fails for red-green colour blindness

Method: sRGB to linear to LMS, Viénot/Brettel/Mollon 1999 dichromat projection,
back to CIE L\*a\*b\*, pairwise CIE76 deltaE. Threshold: 20 comfortable, 10 to 20
weak, under 10 a collision.

| Pair | Simulation | deltaE | Verdict |
|---|---|---|---|
| danger vs ok (**SETTLED vs WALKED_AWAY / FAILED**) | deuteranopia | **9.0** | collision |
| warn vs seller (**SIMULATED vs seller line**) | deuteranopia | **7.5** | collision |
| ok vs seller | protanopia | **9.1** | collision |
| danger vs seller | deuteranopia | 13.7 | weak |
| ok vs warn | protanopia | 12.5 | weak |

**A deuteranope cannot currently tell a settled deal from a walk-away by colour.**
That is the single most important distinction on the screen. This is a pre-existing
defect, not something the re-skin introduces, and the re-skin is the moment to fix it.

## 3. Why the new mapping cannot be a like-for-like swap

Under dichromacy the usable space collapses to roughly one blue-to-yellow axis
plus lightness. Two attempts were measured and rejected:

- **Nine distinct status hues** (teal, grey, ochre, red, violet, amber, blue,
  orange): eleven collisions. Violet vs buyer blue came out at deltaE **0.4**.
- **Six hues** with a neutral grey for pending: teal desaturates toward grey, so
  settled vs pending measured deltaE 5.7. A search over 36 teal and grey
  combinations found exactly one pair clearing 20, and its grey failed contrast
  at 2.37 on the off-white.

With the two party colours occupying the blue and yellow poles, there is room for
**at most two further reliably distinct status hues**.

## 4. Proposed mapping

Colour carries a three-way status **class**. The distinction *within* a class is
made by the literal label and by shape, both of which the UI already renders.

| Class | Hex | Covers | Shape |
|---|---|---|---|
| Good | `#0F6E5E` | SETTLED, SETTLED_STUB, ZOPA exists, derived floor | solid chip, white text |
| Stopped | `#8C1D18` | clamp fired, LLM out of band, FAILED, no ZOPA, SIMULATED | left bar plus tint (inline), solid chip (badge) |
| Neutral | `#2C2C2C` | WALKED_AWAY, PENDING, RUNNING, NOT_ATTEMPTED | outline chip |
| Buyer | `#1D4ED8` | party identity | line, dot, tint |
| Seller | `#C2410C` | party identity | line, dot, tint |

Lime `#E3EF7A` is interaction only: hover, focus ring, active launcher. It never
appears on a status. Its contrast on white is 1.24, so it can only ever be a
background or a border, never text on a light surface, which conveniently makes
misuse as a status hard.

### Measured result

Worst pair, deuteranopia: **21.9** (settled vs neutral). Worst pair, protanopia:
**20.6** (stopped vs neutral). Every pair clears the threshold.

Contrast on the three light backgrounds:

| Colour | #FFFFFF | #F8F8F8 | #ECEBE8 |
|---|---|---|---|
| good `#0F6E5E` | 6.15 | 5.79 | 5.16 |
| stopped `#8C1D18` | 9.11 | 8.58 | 7.65 |
| neutral `#2C2C2C` | 13.97 | 13.15 | 11.71 |
| buyer `#1D4ED8` | 6.70 | 6.31 | 5.62 |
| seller `#C2410C` | 5.18 | 4.88 | **4.34** |

### Two rules this produces

1. **Seller orange is not small text on the off-white.** 4.34 is under AA. It is
   fine on `#FFFFFF` and `#F8F8F8`, and fine on the off-white at 16px bold or
   larger where AA large applies. Darkening it to fix contrast pushes it toward
   the stopped red under deuteranopia (deltaE 23.1 falls to 17.0 at `#B03A0B`),
   so the contrast is better spent than the separation.
2. **These five are light-surface colours only.** None reaches 3:1 on `#2C2C2C`.
   Any status shown on a dark surface must be a solid chip with light text, not
   coloured text on dark.

## 5. What loses a dedicated colour, and what replaces it

| Was | Now | What still separates it |
|---|---|---|
| clamp fired (red) vs LLM out of band (amber) | both stopped red | label text: `GUARDRAIL:` versus `LLM asked` |
| SETTLED (green) vs PENDING (amber) | good teal vs neutral outline | the literal status word, already rendered |
| SIMULATED (amber) | stopped red solid chip | the words `SIMULATED: NO REAL MONEY MOVED` |
| verdict possible (amber) vs impossible (red) | neutral vs stopped | full sentence, already rendered |

No state loses its distinction; three states stop relying on hue alone to carry it.

## 6. Decisions needed before implementation

1. **SIMULATED moves from amber to the stopped red.** It is an integrity control,
   so this is worth confirming rather than assuming. The alternative is keeping an
   amber that measurably collides with seller orange for a protanope (deltaE 3.8).
2. **Clamp and LLM-out-of-band share the stopped red**, separated by label. The
   brief lists them as distinct statuses, so this is a deliberate compression and
   needs a yes.

## Unresolved questions

1. Should the dashboard's dark surfaces be retained anywhere, or is it fully light?
   The five status colours are light-surface only.
2. Does the landing page need any status colour at all? Current assumption: no, it
   uses only the given tokens plus lime.
