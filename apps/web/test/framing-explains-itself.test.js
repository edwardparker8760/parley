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
  assert.match(
    screen,
    /view === null \? null : <NegotiationBriefingStrip view=\{view\} \/>/,
    "the briefing must not be behind a mode, source or provenance check",
  );
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

  // B's two ranges are 45 apart, which is the whole reason it is the narrow one.
  assert.match(briefingFor(snapshot("b").view).situation, /overlap by 45, from 855 to 900/);

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
    .replace(/\): string \{/g, ") {")
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
