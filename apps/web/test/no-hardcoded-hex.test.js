/**
 * Colour is defined once, in `@parley/theme`, and nowhere else.
 *
 * This is not tidiness. Colour carries meaning in this app: a clamp firing, an
 * offer refused out of band, a settled deal, a walk-away. The palette was
 * chosen by measuring dichromat separation, and a near-miss shade invented in
 * one component is a status that no longer matches the status it represents.
 *
 * The rule is also what keeps the two apps honest with each other. The landing
 * page renders the same benchmark outcomes the dashboard does; if either side
 * hardcodes, they drift, and a judge moving from the site to the product sees
 * two different greens for the same word.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".next", "test"]);

/** Hex colours, in the forms CSS and JSX actually use. */
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
/** rgb()/rgba()/hsl() literals, which are the obvious way to smuggle one in. */
const FUNCTIONAL_COLOUR = /\b(rgba?|hsla?)\s*\(/g;

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
    const matches = code(readFileSync(file, "utf8")).match(HEX);
    if (matches !== null) {
      offenders.push(`${relative(APP_ROOT, file)}: ${[...new Set(matches)].join(", ")}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "colour belongs in @parley/theme, where its dichromat separation is measured",
  );
});

test("no rgb, rgba or hsl literal is used to smuggle a colour in", () => {
  const offenders = [];
  for (const file of sourceFiles(APP_ROOT)) {
    const matches = code(readFileSync(file, "utf8")).match(FUNCTIONAL_COLOUR);
    if (matches !== null) offenders.push(relative(APP_ROOT, file));
  }
  assert.deepEqual(offenders, []);
});

test("tokens come from the shared theme, imported once in base.css", () => {
  const base = readFileSync(join(APP_ROOT, "app", "base.css"), "utf8");
  assert.ok(
    base.includes('@import "@parley/theme/tokens.css"'),
    "base.css must read its tokens from the shared theme",
  );
});

test("the scan looked at the files that matter", () => {
  // A grep test that passes because it looked nowhere is worse than none.
  const files = sourceFiles(APP_ROOT).map((f) => relative(APP_ROOT, f));
  assert.ok(files.length >= 12, `expected to scan the dashboard, saw ${files.length}`);
  for (const required of [
    join("app", "dashboard.css"),
    join("components", "dashboard", "live-transcript-ladder.tsx"),
    join("components", "dashboard", "simulated-settlement-badge.tsx"),
  ]) {
    assert.ok(files.includes(required), `${required} was not scanned`);
  }
});
