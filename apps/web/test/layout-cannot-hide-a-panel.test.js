/**
 * A panel must never be able to disappear off the bottom of the screen.
 *
 * ## The bug this exists for
 *
 * The screen is `height: 100vh` with `overflow: hidden`, and the left column
 * once used CSS grid with two explicit rows. The panel count on the left varies
 * (settlement on a deal, post-mortems on a walk-away), so a third panel was
 * auto-placed into an IMPLICIT row, which `overflow: hidden` then silently ate.
 * The settlement panel rendered, passed every assertion about its content, and
 * was invisible. On video that is a screenshot of a deal with no evidence it
 * settled.
 *
 * ## Why this test is structural rather than a browser check
 *
 * Measuring real geometry needs a browser, and putting puppeteer in the test
 * path would add a Chrome download to every clean clone for one assertion.
 * Instead this asserts the three structural conditions that made the bug
 * possible, all of which are cheap to read from source:
 *
 *   1. the left column is a FLEX stack, not a grid with fixed rows, so it
 *      cannot auto-place into a row that does not exist;
 *   2. it sets `min-height: 0`, without which a flex child refuses to shrink
 *      and pushes its siblings out of the clipped area instead of scrolling;
 *   3. every panel the page renders is inside a known container.
 *
 * Real geometry is still verified before any UI change ships, by the harness in
 * `.claude/skills/chrome-devtools/scripts/dashboard-density.mjs`, which reports
 * rows visible without scrolling and whether the page scrolls at all. That is a
 * harness, not a test: it needs a running server and a browser.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(APP_ROOT, "app", "dashboard.css"), "utf8");
const page = readFileSync(join(APP_ROOT, "components", "dashboard", "dashboard-screen.tsx"), "utf8");

/** The body of one CSS rule, by selector. */
function rule(selector) {
  const pattern = new RegExp(
    `(^|\\})[^{}]*\\${selector.startsWith(".") ? "." : ""}${selector.replace(/^\./, "")}\\b[^{}]*\\{([^}]*)\\}`,
    "m",
  );
  const match = pattern.exec(css);
  assert.ok(match !== null, `no rule found for ${selector}`);
  return match[2];
}

test("the screen clips, which is what makes a hidden panel possible", () => {
  // If this ever stops being true the rest of the file is guarding nothing, so
  // the assumption is asserted rather than assumed.
  assert.match(rule(".screen"), /overflow:\s*hidden/);
});

test("the left column is a flex stack, so nothing can be auto-placed", () => {
  const body = rule(".column-left");
  assert.match(body, /display:\s*flex/);
  assert.match(body, /flex-direction:\s*column/);
  assert.doesNotMatch(
    body,
    /grid-template-rows/,
    "fixed rows are what pushed the third panel into an implicit row",
  );
});

test("the left column can shrink, so a tall panel scrolls instead of overflowing", () => {
  assert.match(
    rule(".column-left"),
    /min-height:\s*0/,
    "without min-height:0 a flex child refuses to shrink and pushes siblings out of the clipped area",
  );
});

test("the panel that takes the slack is allowed to scroll on its own", () => {
  const body = rule(".panel-settlement");
  assert.match(body, /flex:\s*1/);
  assert.match(body, /overflow-y:\s*auto/);
});

/*
 * ## The second time this bug shipped
 *
 * The three tests above all passed while the column overflowed anyway. They
 * assert that a panel CAN shrink and scroll; they cannot see that the content
 * above it is too tall for the space, because that is geometry.
 *
 * Measured on the deployed build at a full 1920x1080 viewport, running the
 * "600 against 700" preset: `.column-left` needed 721px and had 619px. With
 * `overflow: visible` the excess spilled into `.screen`, which is
 * `overflow: hidden`, so it was clipped with no scrollbar to reveal it. The
 * guardrail panel ended at y=1126 and the walk-away panel rendered 24px of its
 * 211px at y=1138. Both post-mortem cards were in the DOM. Neither was on
 * screen, and the no-ZOPA sentence at y=899 fell under the fold as soon as
 * ordinary browser chrome reduced the viewport below ~900.
 *
 * Two rules prevent the recurrence, and both are asserted here because both are
 * load-bearing:
 *
 *   1. the column scrolls ITSELF, so overflow is always reachable rather than
 *      silently eaten by the ancestor that clips;
 *   2. the chart is capped, because a 600x300 viewBox at `width: 100%` renders
 *      ~470px tall in a ~940px column and takes three quarters of the space
 *      before any other panel is laid out.
 *
 * After both: column 619/619 at 1080, no-ZOPA sentence at y=744, guardrail
 * panel fully above the fold, walk-away panel visible with both cards.
 */

test("the left column reveals its own overflow instead of losing it", () => {
  assert.match(
    rule(".column-left"),
    /overflow-y:\s*auto/,
    "without this the excess spills into .screen, which is overflow:hidden and shows no scrollbar",
  );
});

test("the chart is capped, so it cannot crowd out the panels below it", () => {
  const body = rule(".chart");
  assert.match(
    body,
    /max-height:\s*\d+px/,
    "an uncapped 600x300 viewBox at width:100% renders ~470px tall and pushes the walk-away panel off screen",
  );

  // A cap that is not smaller than the natural height is not a cap. The chart
  // renders about 470px in this column, so anything at or above that is a
  // no-op that would let the bug back in while the assertion above still
  // passed.
  const capped = /max-height:\s*(\d+)px/.exec(body);
  assert.ok(
    Number(capped[1]) <= 320,
    `max-height ${capped[1]}px is too tall to constrain a chart that renders ~470px`,
  );
});

test("every panel the page renders sits inside a known container", () => {
  const panels = [
    "ConvergencePriceChart",
    "GuardrailLimitsPanel",
    "SettlementStatusPanel",
    "WalkawayPostmortemPanel",
    "LiveTranscriptLadder",
  ];
  for (const panel of panels) {
    assert.ok(page.includes(`<${panel}`), `${panel} is no longer rendered`);
  }

  // The left column and the transcript are the only two slots. Anything else
  // would be laid out by whatever the grid decided, which is the bug.
  const leftColumn = /<div className="column-left">([\s\S]*?)<\/div>/.exec(page);
  assert.ok(leftColumn !== null, "the explicit left column is gone");

  for (const panel of ["ConvergencePriceChart", "GuardrailLimitsPanel"]) {
    assert.ok(
      leftColumn[1].includes(`<${panel}`),
      `${panel} must live in the explicit left column`,
    );
  }
});

test("settlement and walk-away share one slot, because a run is one or the other", () => {
  // Rendering both would put a fourth panel in a three-panel column, which is
  // how the original bug was introduced.
  assert.match(
    page,
    /postMortems\.length > 0[\s\S]*?WalkawayPostmortemPanel[\s\S]*?:[\s\S]*?SettlementStatusPanel/,
    "the two terminal panels must be mutually exclusive",
  );
});
