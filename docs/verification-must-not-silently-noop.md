# Rule: a verification step must not be able to silently no-op

Two separate verification steps in this project have passed while doing
nothing. Both looked exactly like success. Neither was caught by the check
itself; both were caught only because someone looked at a second signal.

This is the failure mode most likely to put something untrue in the
submission, because the whole point of a verification step is that people stop
looking once it goes green.

## The rule

**Any automated check or generated report in this repo must state how many
samples it actually took, and must refuse to conclude when that number is
zero.**

Concretely:

1. **Report the sample count in the artifact itself**, next to the conclusion.
   A reader must be able to see "18 of 18 failed" without re-running anything.
2. **Refuse to emit a verdict at zero samples.** Exit non-zero. An empty run is
   a failure, not a fast success.
3. **Flag partial samples.** If some attempts failed, say so in the body and
   mark the figures as a lower bound.
4. **Confirm the check can fail.** Where practical, deliberately break the
   thing under test and confirm the check goes red. A check never observed
   failing is not yet evidence.

## Instance 1: the phase 03 sabotage patch (2026-08-03)

The guardrail property tests are the project's safety claim, so the plan
included a sabotage step: disable the clamp and confirm the properties fail.
The first attempt applied the patch with a Python heredoc. Python is not
installed on this machine, so the patch was never written, the tests ran
against the *unmodified* clamp, and all seven properties passed.

A passing sabotage check and a sabotage check that never applied are
byte-identical in the output. It was caught only by diffing the file against a
backup before trusting the result. Redone with a direct edit, the properties
failed as intended.

## Instance 2: the latency harness (2026-08-03)

`measure-latency` ran 18 calls against Gemini. All 18 returned 403. The harness
wrote `docs/llm-latency.md` reporting `mean 0.00s`, `p50 0.00s`, and the
conclusion *"A full scenario-A negotiation costs 5s. That fits a 3-minute
video."*

Every number in it was produced by dividing over an empty set. The file was
formatted identically to a real measurement and would have been committed as
evidence for a demo-design decision.

Fixed: the harness now exits non-zero and writes nothing without at least one
successful sample, and annotates partial failures as a lower bound.

## Why this keeps happening

Both cases share a shape: the step's *mechanism* failed in a way that produced
the same surface as success. The sabotage patch failed to apply; the API calls
failed to return. Neither step distinguished "I checked and it was fine" from
"I did not manage to check".

So the check to apply when writing any new verification is not "does it pass?"
but **"could this pass without having done anything?"** If yes, add the sample
count and the zero guard before trusting it.
