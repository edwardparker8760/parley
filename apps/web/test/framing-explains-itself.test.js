/**
 * A VIEWER ARRIVING AT /app COLD MUST BE ABLE TO READ THE SCREEN.
 *
 * A judge may open the deep link before, or instead of, the landing page. Every
 * number on the dashboard used to arrive with no statement of what was being
 * traded, under whose limits, or how it ended, which made a correct screen
 * unreadable.
 *
 * These are wording tests, which is unusual and deliberate: the wording IS the
 * feature here. The data was already right.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(APP_ROOT, ...parts), "utf8");
const snapshot = (letter) =>
  JSON.parse(read("data", `negotiation-snapshot-${letter}.json`));

test("the briefing strip renders above every panel, on every run", () => {
  const screen = read("components", "dashboard", "dashboard-screen.tsx");

  const briefingAt = screen.indexOf("<NegotiationBriefingStrip");
  const gridAt = screen.indexOf('className="grid"');
  assert.ok(briefingAt > 0, "the screen must render the briefing strip");
  assert.ok(
    briefingAt < gridAt,
    "the frame must come before the panels it is the frame for",
  );

  // Its only condition may be "there is a negotiation to describe". Anything
  // else would let a run render its numbers with no setup.
  //
  // Asserted on the CONDITION, not on an exact source line. This test used to
  // pin the literal string `view === null ? null : <NegotiationBriefingStrip
  // view={view} />`, which made it a copy of the implementation and no kind of
  // check at all: it passed happily while a live instance rendered no framing
  // whatsoever before its first run, because `view` is null then and null was
  // exactly what the pinned line produced. A test that quotes the code cannot
  // notice the code is wrong.
  assert.ok(
    !/canRunLive[\s\S]{0,80}<NegotiationBriefingStrip/.test(screen),
    "the briefing must not be behind a mode, source or provenance check",
  );
  assert.ok(
    !/provenance[\s\S]{0,80}<NegotiationBriefingStrip/.test(screen),
    "the briefing must not be behind a provenance check",
  );
});

test("the cold screen, before any run exists, still explains what this is", () => {
  /*
   * The regression this file was written for and missed. A live instance has
   * no view until somebody presses a button, so the briefing strip cannot
   * render, so the FIRST screen a stranger meets was a title, three buttons
   * and one sentence. The explainer is the half that works with no data.
   */
  const screen = read("components", "dashboard", "dashboard-screen.tsx");
  assert.match(
    screen,
    /view === null \?[\s\S]{0,400}<ColdStartExplainer/,
    "the null-view branch must render the explainer, not a bare sentence",
  );

  const explainer = read("components", "dashboard", "cold-start-explainer.tsx");

  // What is traded, who the two sides are, and what the limits do. Any cold
  // visitor needs all three before a single number means anything.
  assert.match(explainer, /bulk inference capacity/);
  assert.match(explainer, /buying/);
  assert.match(explainer, /selling/);
  assert.match(explainer, /owner/i);
  assert.match(explainer, /Neither agent can see the other/i);
  assert.match(explainer, /arithmetic/);

  // It must not reach for a figure it cannot have. There is no run yet.
  // Checked against code only: the doc comment explains why the briefing strip
  // needs a view, and that prose is not a data read.
  const explainerCode = explainer
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(
    !/view\.|props\.view|briefingFor|verdictFor/.test(explainerCode),
    "the explainer runs with no negotiation, so it must not read one",
  );
});

test("the screen says which control starts a run, in a verb", () => {
  const launchers = read("components", "dashboard", "scenario-launcher-buttons.tsx");

  // "Scenario A" is a label. "Start scenario A" is an instruction. A visitor
  // should not have to guess that a card is a button.
  assert.match(launchers, /Start scenario \{scenario\.name\}/);
  assert.match(launchers, /start a negotiation/i);
});

test("only the mode that can start a run uses the word Start", () => {
  /*
   * The two modes render different controls: live gets launchers that POST,
   * replay gets links that swap a recording. The replay control said "Scenario
   * A", which is at least not a lie, but a verb it cannot honour would be: a
   * visitor presses "Start", a finished recording appears, and they conclude
   * the button ran something. "View" is what it does.
   */
  const switcher = read("components", "dashboard", "recorded-run-switcher.tsx");
  const rendered = switcher
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  assert.match(rendered, /View scenario \{run\.scenario\}/);
  assert.ok(
    !/>\s*Start|Start scenario/.test(rendered),
    "the replay switcher must not offer to Start anything",
  );

  // And it must keep saying so in prose, with the way out.
  assert.match(rendered, /cannot start a new negotiation/i);
  assert.match(rendered, /PARLEY_DATA_SOURCE/);
});

test("neither mode opens on an empty screen", () => {
  /*
   * Replay opens on scenario A because its source hands back a default id, so
   * the server renders a finished run with no JavaScript involved. Live had no
   * equivalent and opened on an explanation above a large blank area, which
   * reads as broken. It now starts scenario A itself on first paint.
   */
  const snapshotSource = read("lib", "snapshot-negotiation-source.ts");
  assert.match(
    snapshotSource,
    /defaultNegotiationId\(\)\s*\{[\s\S]{0,300}return BUNDLED\[0\]/,
    "replay mode must default to a bundled run rather than to nothing",
  );

  const screen = read("components", "dashboard", "dashboard-screen.tsx");
  assert.match(screen, /autoStarted/, "live mode must auto-start a negotiation");
  assert.match(
    screen,
    /stream\.start\("A", "engine"\)/,
    "the auto-start must be scenario A",
  );

  // Guarded by a ref, not state: strict mode mounts effects twice and a state
  // flag has not committed by the second run, so it would start two runs.
  assert.match(screen, /useRef\(false\)/);

  // And it must stand down when the URL names a run.
  assert.match(screen, /replayId !== null\) return/);
});

test("no term of art reaches the screen unexplained", () => {
  /*
   * ZOPA appeared five times across the launchers, the switcher and the chart,
   * and is the densest jargon on a screen aimed at people who have not read
   * the codebase. Internal identifiers keep the name; rendered text does not.
   */
  for (const [dir, file] of [
    ["dashboard", "scenario-launcher-buttons.tsx"],
    ["dashboard", "recorded-run-switcher.tsx"],
    ["dashboard", "convergence-price-chart.tsx"],
    ["dashboard", "cold-start-explainer.tsx"],
    ["dashboard", "negotiation-briefing-strip.tsx"],
  ]) {
    const source = read("components", dir, file);

    // What a reader sees: not comments (which discuss the jargon precisely
    // because it was removed), not identifiers like `zopaExists`, not class
    // names like `zopa-band`.
    const rendered = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\b\w*[Zz]opa\w*\b/g, (match) => (/^ZOPA$/.test(match) ? match : ""))
      .replace(/className="[^"]*"/g, "");

    assert.ok(
      !/\bZOPA\b/.test(rendered),
      `${file} renders the word ZOPA; say what it means instead`,
    );
  }
});

test("the briefing states the setup: goods, both limits, and the situation", () => {
  const strip = read("components", "dashboard", "negotiation-briefing-strip.tsx");

  for (const [what, pattern] of [
    ["what is being traded", /briefing\.goods/],
    ["the non-price terms", /briefing\.terms/],
    ["the buyer's ceiling", /briefing\.buyerCeilingMicro/],
    ["the buyer's total budget", /briefing\.buyerBudgetUsdc/],
    ["the seller's floor", /briefing\.sellerFloorMicro/],
    ["where the floor comes from", /briefing\.sellerCostBasisMicro/],
    ["whether the ranges overlap", /briefing\.situation/],
    ["how it ended", /\{verdict\}/],
  ]) {
    assert.match(strip, pattern, `the briefing must state ${what}`);
  }
});

test("the verdict is a plain sentence with no status code in it", () => {
  const { verdictFor } = require_describe();

  for (const letter of ["a", "b", "c"]) {
    const verdict = verdictFor(snapshot(letter).view);

    // No jargon leaking through from the ledger's vocabulary.
    for (const code of [
      "SETTLED_STUB",
      "WALKED_AWAY",
      "NO_ZOPA",
      "MAX_UNIT_PRICE",
      "ZOPA",
      "micro-USDC",
    ]) {
      assert.ok(
        !verdict.includes(code),
        `scenario ${letter.toUpperCase()} verdict leaks "${code}": ${verdict}`,
      );
    }

    assert.ok(verdict.length > 40, `scenario ${letter.toUpperCase()} verdict is too thin`);
    assert.match(verdict, /\.$/, "a verdict is a sentence and ends like one");
  }
});

test("a settled run says the price, the round and the amount; a walk-away says nobody paid", () => {
  const { verdictFor } = require_describe();

  const settled = verdictFor(snapshot("a").view);
  assert.match(settled, /Agreed at 982 per call in round 9/);
  assert.match(settled, /9\.82 USDC settled/);
  // Money that did not move must never read as money that did.
  assert.match(settled, /simulated: no real money moved/);

  const clamped = verdictFor(snapshot("b").view);
  assert.match(
    clamped,
    /the buyer's ceiling of 900 stopped its agent 9 times/,
    "a run where the guardrail fired must say so in the verdict",
  );

  const walked = verdictFor(snapshot("c").view);
  assert.match(walked, /No price satisfied both owners/);
  assert.match(walked, /walked away at round 9/);
  assert.match(walked, /No money moved/);
});

test("the situation sentence names the overlap, or its absence, in numbers", () => {
  const { briefingFor } = require_describe();

  // B's two ranges are 45 apart, which is the whole reason it is the narrow
  // one. All three numbers must appear; the phrasing around them is free to
  // change, and did, when "overlap by 45" was reworded to lead with the prices
  // a reader can act on rather than with the width.
  const narrow = briefingFor(snapshot("b").view).situation;
  for (const figure of ["855", "900", "45"]) {
    assert.match(narrow, new RegExp(`\\b${figure}\\b`), `the situation must name ${figure}`);
  }

  const impossible = briefingFor(snapshot("c").view).situation;
  assert.match(impossible, /do not overlap at all/);
  assert.match(impossible, /cannot go below 951/);
  assert.match(impossible, /cannot go above 600/);
  // One sentence, one colon at most: this is prose, not a log line.
  assert.ok(
    (impossible.match(/:/g) ?? []).length === 0,
    `the situation reads like a log line: ${impossible}`,
  );
});

test("every clamp is rendered in words beside its code", () => {
  const ladder = read("components", "dashboard", "live-transcript-ladder.tsx");
  assert.match(
    ladder,
    /clampSentence\(clamp\)/,
    "a clamp badge must carry its plain-language sentence",
  );

  const { clampSentence } = require_describe();
  const clamped = snapshot("b")
    .view.messages.flatMap((message) => message.clamps ?? []);
  assert.ok(clamped.length > 0, "scenario B must contain clamps for this to test anything");

  for (const clamp of clamped) {
    const sentence = clampSentence(clamp);
    assert.ok(sentence.includes(clamp.proposed), "the sentence must say what the agent wanted");
    assert.ok(sentence.includes(clamp.clamped), "the sentence must say what was sent instead");
    assert.match(sentence, /Arithmetic sent/, "the sentence must name what decided");
    assert.ok(!sentence.includes(clamp.bound), `the sentence must not repeat the code: ${sentence}`);
  }
});

test("the chart makes the limits heavier than the offers", () => {
  const css = read("app", "dashboard.css");

  const limit = /\.reservation-line \{[^}]*stroke-width:\s*([\d.]+)/.exec(css);
  const offer = /\.price-line \{[^}]*stroke-width:\s*([\d.]+)/.exec(css);
  assert.ok(limit !== null && offer !== null, "both stroke weights must be declared");
  assert.ok(
    Number(limit[1]) > Number(offer[1]),
    `the limits are the frame and must outweigh the offers, got ${limit[1]} vs ${offer[1]}`,
  );

  // And each line has to say whose limit it is, not just where it sits.
  const chart = read("components", "dashboard", "convergence-price-chart.tsx");
  assert.match(chart, /BUYER ceiling \{view\.observer\.buyerReservationMicroUsdc\}/);
  assert.match(chart, /SELLER floor \{view\.observer\.sellerReservationMicroUsdc\}/);
});

/**
 * The describe module is TypeScript, and these tests run on bare node with no
 * build step. Rather than add a compiler to the test path for three pure
 * functions, the file is read and its types stripped: it contains no runtime
 * TypeScript, only annotations.
 */
function require_describe() {
  const source = read("lib", "describe-negotiation.ts");
  const stripped = source
    // The two imports are a type-only import and one display helper, which is
    // inlined below rather than resolved through the "@/..." path alias.
    .replace(/^import[\s\S]*?;\s*$/gm, "")
    .replace(/^export interface[\s\S]*?^\}/gm, "")
    .replace(/: NegotiationBriefing\b/g, "")
    .replace(/: NegotiationView\b/g, "")
    .replace(/: ClampMarkerView\b/g, "")
    // Return annotations, including unions like `): string | null {`. Written
    // generally because the narrow version (`\): string \{`) silently broke
    // four unrelated tests the first time a function returned anything else,
    // and the failure surfaced as `SyntaxError: Unexpected token ':'` with no
    // hint that this loader was the cause.
    .replace(/\):\s*[A-Za-z[\]|\s]+\{/g, ") {")
    .replace(/const parts: string\[\] = \[\]/g, "const parts = []")
    .replace(/^export /gm, "");

  const factory = new Function(
    "microToUsdc",
    `${stripped}\nreturn { briefingFor, verdictFor, clampSentence };`,
  );

  return factory(microToUsdc);
}

/** Mirrors components/dashboard/format-micro-usdc.ts. */
function microToUsdc(micro) {
  const value = BigInt(micro);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${fraction}`.replace(/0+$/, "").replace(/\.$/, ".0");
}
