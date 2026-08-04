/**
 * The landing page reads its colour from the same file the product does.
 *
 * The specific risk here is not a broken page, it is a subtly wrong one. This
 * page renders the benchmark outcomes with the real SETTLED and WALKED AWAY
 * colours. A judge reads this page, then the repository, then watches the
 * video, inside a few minutes. If the green here is approximated rather than
 * imported, the same word appears in two shades across three surfaces, and that
 * reads as carelessness about exactly the thing the project claims to be careful
 * about.
 *
 * It also asserts the reverse direction: this page must NOT invent status
 * meanings of its own, and the lime accent stays on interaction.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".next", "out", "test"]);

function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    if (SKIP.has(entry)) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(tsx?|jsx?|css)$/.test(entry)) found.push(full);
  }
  return found;
}

function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("no hex colour is written outside the theme package", () => {
  const offenders = [];
  for (const file of sourceFiles(APP_ROOT)) {
    const matches = code(readFileSync(file, "utf8")).match(/#[0-9a-fA-F]{3,8}\b/g);
    if (matches !== null) {
      offenders.push(`${relative(APP_ROOT, file)}: ${[...new Set(matches)].join(", ")}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("the shared theme is imported once, in the base stylesheet", () => {
  // The theme moved to base.css when the two apps merged: it is imported by the
  // root layout so both routes get it, and neither route sheet repeats it.
  const base = readFileSync(join(APP_ROOT, "app", "base.css"), "utf8");
  assert.ok(base.includes('@import "@parley/theme/tokens.css"'));

  for (const sheet of ["landing.css", "dashboard.css"]) {
    const css = readFileSync(join(APP_ROOT, "app", sheet), "utf8");
    assert.doesNotMatch(css, /@import .*tokens.css/, sheet + " must not re-import the theme");
  }
});

test("the benchmark table uses real status tokens, not approximations", () => {
  const css = readFileSync(join(APP_ROOT, "app", "landing.css"), "utf8");
  assert.match(css, /\.verdict-good\s*\{[^}]*var\(--status-good\)/);
  assert.match(css, /\.verdict-stopped\s*\{[^}]*var\(--status-stopped\)/);
  assert.match(css, /\.bench tr\.is-engine td\s*\{[^}]*var\(--status-good-tint\)/);
});

test("decoration never borrows a status colour", () => {
  // The geometric bullets and the hand-drawn circles are decoration. If either
  // reached for a status token, this page would start implying meaning it does
  // not have.
  for (const name of ["geometric-bullet.tsx", "circled-label.tsx"]) {
    const source = code(readFileSync(join(APP_ROOT, "components", "landing", name), "utf8"));
    assert.doesNotMatch(source, /--status-|--party-/, `${name} must not use status colour`);
  }
});

test("the mechanism diagram uses weight for emphasis, not status hue", () => {
  // It explains mechanisms; it does not display outcomes. This shipped once
  // using --status-good for its emphasis labels, which both diluted the meaning
  // of the settled colour and measured 2.27:1 on the dark band.
  const css = readFileSync(join(APP_ROOT, "app", "landing.css"), "utf8");
  const stackRules = css.match(/\.stack[\w-]*\s*\{[^}]*\}/g) ?? [];
  assert.ok(stackRules.length > 0, "the stack rules were not found");
  for (const rule of stackRules) {
    assert.doesNotMatch(
      rule,
      /var\(--status-|var\(--party-/,
      `a .stack rule borrows a meaning colour: ${rule.slice(0, 60)}`,
    );
  }
});

test("product artifacts DO use the real status tokens", () => {
  // The opposite rule, and just as important. The hero excerpt shows real clamp
  // events and the comparison shows real outcomes, so approximating either
  // would put a near-miss shade of a meaning colour on a public page.
  const css = readFileSync(join(APP_ROOT, "app", "landing.css"), "utf8");
  assert.match(css, /\.excerpt-clamp\s*\{[^}]*var\(--status-stopped\)/);
  assert.match(css, /\.excerpt-party\.buyer\s*\{[^}]*var\(--party-buyer\)/);
  assert.match(css, /\.captured-demanded \.captured-value\s*\{[^}]*var\(--status-stopped\)/);
  assert.match(css, /\.captured-sent \.captured-value\s*\{[^}]*var\(--status-good\)/);
});

test("the hero excerpt is transcribed from a named run, not invented", () => {
  const source = readFileSync(
    join(APP_ROOT, "components", "landing", "transcript-excerpt.tsx"),
    "utf8",
  );
  // The comment naming the run is the audit trail. Without it nobody can check
  // whether the ladder on the front page ever happened.
  assert.match(source, /b-baseline-\w+/, "the excerpt must name the run it came from");
  assert.match(source, /MAX_UNIT_PRICE/);
});

test("the page renders every required section", () => {
  const page = readFileSync(join(APP_ROOT, "app", "page.tsx"), "utf8");
  for (const marker of [
    "Agentic economy",
    "The gap",
    "The claim",
    "Measured",
    "Plainly",
    "See it",
  ]) {
    assert.ok(page.includes(marker), `section label "${marker}" is missing`);
  }
  // The honest limitations section is not optional and not decorative.
  assert.ok(page.includes("What is not true"));
  assert.ok(page.includes("No real money has moved"));
});

test("the scan looked at the files that matter", () => {
  const files = sourceFiles(APP_ROOT).map((f) => relative(APP_ROOT, f));
  assert.ok(files.length >= 6, `expected to scan the landing app, saw ${files.length}`);
  assert.ok(files.includes(join("app", "landing.css")));
  assert.ok(files.includes(join("components", "landing", "benchmark-table.tsx")));
});
