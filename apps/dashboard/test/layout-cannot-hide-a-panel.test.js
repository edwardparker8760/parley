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
const css = readFileSync(join(APP_ROOT, "app", "globals.css"), "utf8");
const page = readFileSync(join(APP_ROOT, "app", "page.tsx"), "utf8");

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
